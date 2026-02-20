import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { parseBookingEmail } from "./parser.ts";
import {
  lookupUserBySenderEmail,
  fetchUserEventsForContext,
  hasProcessedEmail,
  createReceivedEmail,
  updateEmailStatus,
  saveEvents,
} from "./db.ts";
import {
  fetchReceivedEmail,
  fetchAttachmentContent,
} from "./email.ts";

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const resendWebhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");

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

  // Look up sender in user_emails table (replaces hardcoded whitelist)
  const userInfo = await lookupUserBySenderEmail(senderEmail);
  if (!userInfo) {
    console.warn(`Rejected email from unregistered sender: ${senderEmail}`);
    return new Response(
      JSON.stringify({ ok: true, rejected: "unregistered sender" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`Matched sender to user: ${userInfo.userId}, reply to: ${userInfo.primaryEmail}`);

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
    let fullEmail;
    try {
      fullEmail = await fetchReceivedEmail(resendApiKey, emailId);
    } catch (fetchErr) {
      console.error("Failed to fetch email from Resend:", fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
      throw fetchErr;
    }
    // Use plain text preferably to reduce memory; only fall back to HTML
    const emailBody = fullEmail.text || fullEmail.html || "";
    console.log(`Email body length: ${emailBody.length} chars, html length: ${fullEmail.html?.length ?? 0}, attachments: ${fullEmail.attachments?.length ?? 0}`);

    // Release HTML from memory early — we only need the text or a cleaned version
    const attachments = fullEmail.attachments ?? [];
    fullEmail = null as any; // free memory

    console.log("[step 2] Processing attachments...");
    // Step 2: Extract text from PDF attachments
    let attachmentText = "";
    if (attachments.length > 0) {
      for (const att of attachments) {
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
    console.log("[step 3] Cleaning content...");
    const rawContent = emailBody + attachmentText;
    const fullContent = cleanContentForLlm(rawContent);
    console.log(`[step 3] Cleaned content: ${fullContent.length} chars`);

    // Step 4: Create the received_emails row (with user_id)
    console.log("[step 4] Creating received_emails row...");
    // Truncate raw body to 50KB to avoid memory/storage issues with large HTML emails
    const truncatedRaw = rawContent.length > 50000 ? rawContent.slice(0, 50000) + "\n[...truncated]" : rawContent;
    emailRowId = await createReceivedEmail(emailId, emailSubject, senderEmail, truncatedRaw, userInfo.userId);
    console.log(`[step 4] Created received_emails row: ${emailRowId}`);

    if (fullContent.trim().length === 0) {
      console.warn("No email content found (body and attachments are empty)");
      await updateEmailStatus(emailRowId, "failed", 0, "Email body and attachments were empty");
      return new Response(
        JSON.stringify({ ok: true, events: 0, error: "empty content" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 5: Fetch existing events for travel time context
    console.log("[step 5] Fetching existing events for itinerary context...");
    const existingEvents = await fetchUserEventsForContext(userInfo.userId);
    console.log(`[step 5] Found ${existingEvents.length} existing events for context`);

    // Step 6: Parse booking with Claude (with itinerary context)
    console.log(`[step 6] Calling Claude API to parse booking (${fullContent.length} chars)...`);
    const parseResult = await parseBookingEmail(
      emailSubject,
      fullContent,
      anthropicApiKey,
      existingEvents,
      userInfo.homeBase
    );

    if (parseResult.events.length === 0) {
      console.log("No booking events found in email");
      await updateEmailStatus(emailRowId, "no_events", 0);
      return new Response(
        JSON.stringify({ ok: true, events: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Parsed ${parseResult.events.length} event(s)`);

    // Step 7: Save events linked to the email row (with user_id)
    const savedEvents = await saveEvents(emailRowId, parseResult.events, userInfo.userId);
    await updateEmailStatus(emailRowId, "parsed", savedEvents.length);
    console.log(`Saved ${savedEvents.length} event(s) to database`);

    return new Response(
      JSON.stringify({
        ok: true,
        events: parseResult.events.length,
        saved: savedEvents.length,
        userId: userInfo.userId,
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
    const isApiError = errorMessage.includes("Claude") || errorMessage.includes("Resend");
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: isApiError ? 200 : 500, headers: { "Content-Type": "application/json" } }
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
