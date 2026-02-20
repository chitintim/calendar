import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { parseBookingEmail } from "./parser.ts";
import { generateIcs } from "./ics.ts";
import {
  hasProcessedEmail,
  createReceivedEmail,
  updateEmailStatus,
  markIcsSent,
  saveEvents,
} from "./db.ts";
import {
  sendCalendarEmail,
  sendParseFailureEmail,
  fetchReceivedEmail,
  fetchAttachmentContent,
} from "./email.ts";

// Only process emails from these addresses
const ALLOWED_SENDERS = [
  "REDACTED",
  "REDACTED",
];

// Domain used for ICS UIDs
const ICS_DOMAIN = "calendar-helper.supabase.co";

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const resendWebhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const resendFromAddress = Deno.env.get("RESEND_FROM_ADDRESS") ?? "Calendar Helper <noreply@resend.dev>";

  if (!resendApiKey || !anthropicApiKey) {
    console.error("Missing required secrets: RESEND_API_KEY or ANTHROPIC_API_KEY");
    return new Response("Server configuration error", { status: 500 });
  }

  let payload: any;

  try {
    const rawBody = await req.text();

    // Verify webhook signature if secret is configured
    if (resendWebhookSecret) {
      const svixId = req.headers.get("svix-id");
      const svixTimestamp = req.headers.get("svix-timestamp");
      const svixSignature = req.headers.get("svix-signature");

      if (!svixId || !svixTimestamp || !svixSignature) {
        console.warn("Missing Svix headers — rejecting unverified webhook");
        return new Response("Unauthorized", { status: 401 });
      }

      const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
      const secretBytes = base64ToBytes(resendWebhookSecret.replace("whsec_", ""));
      const key = await crypto.subtle.importKey(
        "raw",
        secretBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
      const expectedSignature = bytesToBase64(new Uint8Array(signatureBytes));

      const signatures = svixSignature.split(" ");
      const verified = signatures.some((sig) => {
        const sigValue = sig.replace("v1,", "");
        return sigValue === expectedSignature;
      });

      if (!verified) {
        console.warn("Webhook signature verification failed");
        return new Response("Unauthorized", { status: 401 });
      }
    }

    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("Failed to parse request body:", err);
    return new Response("Bad request", { status: 400 });
  }

  // Handle different webhook event types
  const eventType = payload.type;
  if (eventType && eventType !== "email.received") {
    return new Response(JSON.stringify({ ok: true, skipped: eventType }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Extract email metadata from webhook payload
  // IMPORTANT: Resend webhooks only contain metadata, NOT the email body.
  const emailData = payload.data ?? payload;
  const senderEmail = extractEmail(emailData.from);
  const emailSubject = emailData.subject ?? "(no subject)";
  const emailId = emailData.email_id ?? emailData.id;

  console.log(`Received email from: ${senderEmail}, subject: ${emailSubject}, id: ${emailId}`);

  // Sender whitelist check
  if (!ALLOWED_SENDERS.includes(senderEmail.toLowerCase())) {
    console.warn(`Rejected email from unauthorized sender: ${senderEmail}`);
    return new Response(
      JSON.stringify({ ok: true, rejected: "unauthorized sender" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Deduplication: skip if we've already processed this email
  if (emailId) {
    const alreadyProcessed = await hasProcessedEmail(emailId);
    if (alreadyProcessed) {
      console.log(`Already processed email ${emailId} — skipping duplicate webhook`);
      return new Response(
        JSON.stringify({ ok: true, skipped: "duplicate" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  let emailRowId: string | null = null;

  try {
    // Step 1: Fetch the full email content from Resend API
    console.log("Fetching full email content from Resend API...");
    const fullEmail = await fetchReceivedEmail(resendApiKey, emailId);
    const emailBody = fullEmail.text || fullEmail.html || "";
    console.log(`Email body length: ${emailBody.length} chars, attachments: ${fullEmail.attachments?.length ?? 0}`);

    // Step 2: Extract text from PDF attachments
    let attachmentText = "";
    if (fullEmail.attachments && fullEmail.attachments.length > 0) {
      for (const att of fullEmail.attachments) {
        console.log(`Processing attachment: ${att.filename} (${att.content_type})`);

        const isRelevant =
          att.content_type === "application/pdf" ||
          att.content_type.includes("pdf") ||
          att.content_type.startsWith("text/") ||
          att.filename?.toLowerCase().endsWith(".pdf") ||
          att.filename?.toLowerCase().endsWith(".txt") ||
          att.filename?.toLowerCase().endsWith(".html");

        if (!isRelevant) {
          console.log(`Skipping non-text attachment: ${att.filename}`);
          continue;
        }

        try {
          const text = await fetchAttachmentContent(
            resendApiKey,
            emailId,
            att.id,
            att.content_type
          );
          if (text && text.trim().length > 0) {
            attachmentText += `\n\n--- Attachment: ${att.filename} ---\n${text}`;
            console.log(`Extracted ${text.length} chars from ${att.filename}`);
          }
        } catch (attErr) {
          console.warn(`Failed to extract text from ${att.filename}:`, attErr);
        }
      }
    }

    // Step 3: Combine and clean content
    const rawContent = emailBody + attachmentText;
    const fullContent = cleanContentForLlm(rawContent);

    // Step 4: Create the received_emails row (stores raw email, tracks status)
    emailRowId = await createReceivedEmail(emailId, emailSubject, senderEmail, rawContent);
    console.log(`Created received_emails row: ${emailRowId}`);

    if (fullContent.trim().length === 0) {
      console.warn("No email content found (body and attachments are empty)");
      await updateEmailStatus(emailRowId, "failed", 0, "Email body and attachments were empty");
      await sendParseFailureEmail(
        resendApiKey,
        resendFromAddress,
        emailSubject,
        "Could not retrieve any email content. The email body and attachments were empty."
      );
      return new Response(
        JSON.stringify({ ok: true, events: 0, error: "empty content" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 5: Parse booking with Claude
    console.log(`Calling Claude API to parse booking (${fullContent.length} chars)...`);
    const parseResult = await parseBookingEmail(
      emailSubject,
      fullContent,
      anthropicApiKey
    );

    if (parseResult.events.length === 0) {
      console.log("No booking events found in email");
      await updateEmailStatus(emailRowId, "no_events", 0);
      await sendParseFailureEmail(
        resendApiKey,
        resendFromAddress,
        emailSubject,
        "No booking events could be detected in this email. It may not be a booking confirmation."
      );
      return new Response(
        JSON.stringify({ ok: true, events: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Parsed ${parseResult.events.length} event(s)`);

    // Step 6: Save events linked to the email row
    const savedEvents = await saveEvents(emailRowId, parseResult.events);
    await updateEmailStatus(emailRowId, "parsed", savedEvents.length);
    console.log(`Saved ${savedEvents.length} event(s) to database`);

    // Step 7: Generate ICS (all events from this email in one .ics file)
    const icsContent = generateIcs(parseResult.events, ICS_DOMAIN);

    // Build event summary for the reply email body
    const eventSummary = parseResult.events
      .map((e) => {
        const ref = e.bookingReference ? ` (Ref: ${e.bookingReference})` : "";
        return `${e.type.toUpperCase()}: ${e.title}${ref}`;
      })
      .join("<br>");

    // Step 8: Send calendar email (one reply per inbound email, with all events)
    console.log("Sending calendar email...");
    await sendCalendarEmail(
      resendApiKey,
      resendFromAddress,
      emailSubject,
      icsContent,
      eventSummary
    );
    console.log("Calendar email sent successfully");

    await markIcsSent(emailRowId);

    return new Response(
      JSON.stringify({
        ok: true,
        events: parseResult.events.length,
        saved: savedEvents.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Processing failed:", errorMessage);

    // Update email status if we got far enough to create the row
    if (emailRowId) {
      try {
        await updateEmailStatus(emailRowId, "failed", 0, errorMessage);
      } catch (dbErr) {
        console.error("Failed to update email status:", dbErr);
      }
    }

    // API errors → 200 (no retry). Transient errors → 500 (Resend retries).
    if (errorMessage.includes("Claude") || errorMessage.includes("Resend")) {
      try {
        await sendParseFailureEmail(
          resendApiKey!,
          resendFromAddress,
          emailSubject,
          errorMessage
        );
      } catch {
        // Best effort
      }
      return new Response(
        JSON.stringify({ ok: false, error: errorMessage }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Clean email/PDF content to reduce LLM token usage.
 */
function cleanContentForLlm(content: string): string {
  let cleaned = content;

  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<[^>]+>/g, " ");

  cleaned = cleaned.replace(/https?:\/\/[^\s)\]}>]+/g, "[link]");
  cleaned = cleaned.replace(/mailto:[^\s)\]}>]+/g, "");
  cleaned = cleaned.replace(/data:[^\s]+/g, "");

  cleaned = cleaned.replace(/&[a-zA-Z]+;/g, " ");
  cleaned = cleaned.replace(/&#\d+;/g, " ");

  cleaned = cleaned.replace(/[A-Za-z0-9+/=]{50,}/g, "[encoded]");

  cleaned = cleaned.replace(/[ \t]+/g, " ");
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, "\n\n");

  cleaned = cleaned.trim();

  if (cleaned.length > 15000) {
    cleaned = cleaned.slice(0, 15000) + "\n[...content truncated]";
  }

  return cleaned;
}

function extractEmail(from: string): string {
  if (!from) return "";
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return from.trim();
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
