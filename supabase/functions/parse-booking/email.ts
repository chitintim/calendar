// No hardcoded REPLY_TO — recipient is now passed as a parameter
// from the user's primary email in user_emails table.

// ==========================================
// Inbound email retrieval
// ==========================================

interface ReceivedEmailAttachment {
  id: string;
  filename: string;
  content_type: string;
}

interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  attachments: ReceivedEmailAttachment[];
}

/**
 * Fetch the full received email content from Resend API.
 * The webhook only sends metadata — we need this call to get the actual body.
 */
export async function fetchReceivedEmail(
  resendApiKey: string,
  emailId: string
): Promise<ReceivedEmail> {
  const response = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}`,
    {
      headers: { Authorization: `Bearer ${resendApiKey}` },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Resend received email API error (${response.status}): ${errText}`
    );
  }

  return await response.json();
}

/**
 * Fetch an attachment's download URL from Resend, then download its content.
 * Returns the raw text content for text-based attachments,
 * or extracted text for PDFs.
 */
export async function fetchAttachmentContent(
  resendApiKey: string,
  emailId: string,
  attachmentId: string,
  contentType: string
): Promise<string | null> {
  // Get attachment metadata with download URL
  const metaResponse = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachmentId}`,
    {
      headers: { Authorization: `Bearer ${resendApiKey}` },
    }
  );

  if (!metaResponse.ok) {
    console.warn(
      `Failed to fetch attachment metadata: ${metaResponse.status}`
    );
    return null;
  }

  const meta = await metaResponse.json();
  const downloadUrl = meta.download_url;
  if (!downloadUrl) {
    console.warn("No download_url in attachment metadata");
    return null;
  }

  // Download the actual file
  const fileResponse = await fetch(downloadUrl);
  if (!fileResponse.ok) {
    console.warn(`Failed to download attachment: ${fileResponse.status}`);
    return null;
  }

  // For PDF files, extract readable text
  if (contentType === "application/pdf" || contentType.includes("pdf")) {
    const buffer = await fileResponse.arrayBuffer();
    // Limit PDF processing to 2MB to avoid memory issues in edge functions
    if (buffer.byteLength > 2 * 1024 * 1024) {
      console.warn(`PDF too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB), truncating to 2MB`);
      return extractTextFromPdf(new Uint8Array(buffer.slice(0, 2 * 1024 * 1024)));
    }
    return extractTextFromPdf(new Uint8Array(buffer));
  }

  // For text-based files (text/plain, text/html, text/calendar, etc.)
  if (contentType.startsWith("text/")) {
    return await fileResponse.text();
  }

  // For other types, skip
  return null;
}

/**
 * Extract readable text from a PDF buffer.
 * This is a lightweight approach that extracts text streams from the PDF
 * without needing a full PDF parsing library (which may not work in Deno).
 *
 * It handles the most common PDF text encodings used in booking confirmations.
 */
function extractTextFromPdf(pdfBytes: Uint8Array): string {
  const pdfText = new TextDecoder("latin1").decode(pdfBytes);
  const textParts: string[] = [];
  let totalLength = 0;
  const MAX_TEXT_LENGTH = 30000; // Cap extraction at 30KB

  // Strategy 1: Extract text from BT...ET blocks (PDF text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(pdfText)) !== null) {
    if (totalLength >= MAX_TEXT_LENGTH) break;
    const block = match[1];

    // Extract text from Tj operator (show text string)
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const text = unescapePdfString(tjMatch[1]);
      textParts.push(text);
      totalLength += text.length;
      if (totalLength >= MAX_TEXT_LENGTH) break;
    }

    // Extract text from TJ operator (show text array)
    if (totalLength < MAX_TEXT_LENGTH) {
      const tjArrayRegex = /\[((?:[^[\]]*|\([^)]*\))*)\]\s*TJ/gi;
      let tjArrayMatch;
      while ((tjArrayMatch = tjArrayRegex.exec(block)) !== null) {
        if (totalLength >= MAX_TEXT_LENGTH) break;
        const arrayContent = tjArrayMatch[1];
        const stringRegex = /\(([^)]*)\)/g;
        let strMatch;
        while ((strMatch = stringRegex.exec(arrayContent)) !== null) {
          const text = unescapePdfString(strMatch[1]);
          textParts.push(text);
          totalLength += text.length;
          if (totalLength >= MAX_TEXT_LENGTH) break;
        }
      }
    }
  }

  // Strategy 2: If BT/ET extraction got very little, try stream extraction
  if (textParts.join("").trim().length < 50) {
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let streamMatch;
    while ((streamMatch = streamRegex.exec(pdfText)) !== null) {
      if (totalLength >= MAX_TEXT_LENGTH) break;
      const content = streamMatch[1];
      // Look for readable ASCII text sequences
      const readableText = content.replace(/[^\x20-\x7E\n\r\t]/g, " ");
      const cleaned = readableText
        .replace(/\s{3,}/g, "\n")
        .trim();
      if (cleaned.length > 20) {
        textParts.push(cleaned);
        totalLength += cleaned.length;
      }
    }
  }

  const result = textParts.join(" ").replace(/\s+/g, " ").trim();
  return result.length > MAX_TEXT_LENGTH ? result.slice(0, MAX_TEXT_LENGTH) : result;
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

