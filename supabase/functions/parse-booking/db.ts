import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ParsedEvent } from "./parser.ts";

function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey);
}

/**
 * Convert a local datetime + timezone to a UTC timestamptz string for Postgres.
 * Input:  "2026-03-15T23:35:00", "Asia/Hong_Kong"
 * Output: ISO string in UTC
 */
function localToUtc(localDateTime: string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset",
  });

  const localDate = new Date(localDateTime + "Z");
  const parts = formatter.formatToParts(localDate);
  const offsetPart = parts.find((p) => p.type === "timeZoneName");

  if (offsetPart) {
    const match = offsetPart.value.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (match) {
      const sign = match[1] === "+" ? -1 : 1;
      const hours = parseInt(match[2]);
      const minutes = parseInt(match[3]);
      const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;
      const utcDate = new Date(localDate.getTime() + offsetMs);
      return utcDate.toISOString();
    }
  }

  return localDate.toISOString();
}

// ==========================================
// received_emails table
// ==========================================

/**
 * Check if we've already processed this Resend email (deduplication).
 */
export async function hasProcessedEmail(resendEmailId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("received_emails")
    .select("id", { count: "exact", head: true })
    .eq("resend_email_id", resendEmailId);

  if (error) {
    console.error("Dedup check failed:", error);
    return false; // fail open
  }

  return (count ?? 0) > 0;
}

/**
 * Create a received_emails record. Returns the row id.
 */
export async function createReceivedEmail(
  resendEmailId: string,
  subject: string,
  sender: string,
  rawBody: string
): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("received_emails")
    .insert({
      resend_email_id: resendEmailId,
      subject,
      sender,
      raw_body: rawBody,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create received_emails row: ${error.message}`);
  }

  return data.id;
}

/**
 * Update received_emails status after processing.
 */
export async function updateEmailStatus(
  emailRowId: string,
  status: "parsed" | "failed" | "no_events",
  eventCount: number,
  errorMessage?: string
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("received_emails")
    .update({
      status,
      event_count: eventCount,
      error_message: errorMessage ?? null,
    })
    .eq("id", emailRowId);

  if (error) {
    console.error("Failed to update email status:", error);
  }
}

/**
 * Mark email as having its ICS sent.
 */
export async function markIcsSent(emailRowId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("received_emails")
    .update({ ics_sent: true })
    .eq("id", emailRowId);

  if (error) {
    console.error("Failed to mark ics_sent:", error);
  }
}

// ==========================================
// events table
// ==========================================

export interface SavedEvent {
  id: string;
  event_type: string;
  title: string;
}

/**
 * Save parsed events linked to a received_emails row.
 */
export async function saveEvents(
  emailRowId: string,
  events: ParsedEvent[]
): Promise<SavedEvent[]> {
  const supabase = getSupabaseClient();
  const saved: SavedEvent[] = [];

  for (const event of events) {
    const { data, error } = await supabase
      .from("events")
      .insert({
        email_id: emailRowId,
        event_type: event.type,
        title: event.title,
        start_at: localToUtc(event.startDateTime, event.startTimezone),
        start_timezone: event.startTimezone,
        end_at: localToUtc(event.endDateTime, event.endTimezone),
        end_timezone: event.endTimezone,
        location: event.location,
        end_location: event.endLocation,
        is_all_day: event.isAllDay,
        booking_reference: event.bookingReference,
        notes: event.notes,
      })
      .select("id, event_type, title")
      .single();

    if (error) {
      console.error(`Failed to save event "${event.title}":`, error);
      continue;
    }

    if (data) {
      saved.push(data as SavedEvent);
    }
  }

  return saved;
}
