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

  // Strategy 1: Extract text from BT...ET blocks (PDF text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(pdfText)) !== null) {
    const block = match[1];

    // Extract text from Tj operator (show text string)
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textParts.push(unescapePdfString(tjMatch[1]));
    }

    // Extract text from TJ operator (show text array)
    const tjArrayRegex = /\[((?:[^[\]]*|\([^)]*\))*)\]\s*TJ/gi;
    let tjArrayMatch;
    while ((tjArrayMatch = tjArrayRegex.exec(block)) !== null) {
      const arrayContent = tjArrayMatch[1];
      const stringRegex = /\(([^)]*)\)/g;
      let strMatch;
      while ((strMatch = stringRegex.exec(arrayContent)) !== null) {
        textParts.push(unescapePdfString(strMatch[1]));
      }
    }
  }

  // Strategy 2: If BT/ET extraction got very little, try stream extraction
  if (textParts.join("").trim().length < 50) {
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let streamMatch;
    while ((streamMatch = streamRegex.exec(pdfText)) !== null) {
      const content = streamMatch[1];
      // Look for readable ASCII text sequences
      const readableText = content.replace(/[^\x20-\x7E\n\r\t]/g, " ");
      const cleaned = readableText
        .replace(/\s{3,}/g, "\n")
        .trim();
      if (cleaned.length > 20) {
        textParts.push(cleaned);
      }
    }
  }

  const result = textParts.join(" ").replace(/\s+/g, " ").trim();
  return result;
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

// ==========================================
// Outbound email sending
// ==========================================

/**
 * Send an email with .ics attachment via Resend API.
 */
export async function sendCalendarEmail(
  resendApiKey: string,
  fromAddress: string,
  replyToAddress: string,
  subject: string,
  icsContent: string,
  eventSummary: string
): Promise<void> {
  // Base64 encode the ICS content for the attachment
  const icsBase64 = btoa(
    new TextEncoder()
      .encode(icsContent)
      .reduce((s, b) => s + String.fromCharCode(b), "")
  );

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px;">
  <h2 style="color: #333;">Calendar Event Ready</h2>
  <p>A booking has been parsed from your email:</p>
  <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <strong>${escapeHtml(subject)}</strong>
    <br><br>
    ${escapeHtml(eventSummary)}
  </div>
  <p>Open the attached <strong>.ics file</strong> to add this event to your calendar.</p>
  <p style="color: #888; font-size: 12px;">Sent by Calendar Helper</p>
</div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: replyToAddress,
      subject: `📅 ${subject}`,
      html: htmlBody,
      attachments: [
        {
          filename: "event.ics",
          content: icsBase64,
          content_type: "application/ics",
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errText}`);
  }
}

/**
 * Send a notification that parsing failed.
 */
export async function sendParseFailureEmail(
  resendApiKey: string,
  fromAddress: string,
  replyToAddress: string,
  originalSubject: string,
  errorMessage: string
): Promise<void> {
  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px;">
  <h2 style="color: #c00;">Could Not Parse Booking</h2>
  <p>Calendar Helper received an email but could not extract booking details:</p>
  <div style="background: #fff3f3; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <strong>Subject:</strong> ${escapeHtml(originalSubject)}<br>
    <strong>Error:</strong> ${escapeHtml(errorMessage)}
  </div>
  <p>The raw email has been saved to the database for manual review.</p>
  <p style="color: #888; font-size: 12px;">Sent by Calendar Helper</p>
</div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: replyToAddress,
      subject: `⚠️ Parse failed: ${originalSubject}`,
      html: htmlBody,
    }),
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
