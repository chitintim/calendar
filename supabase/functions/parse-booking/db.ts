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
// User lookup
// ==========================================

export interface UserInfo {
  userId: string;
  primaryEmail: string;
  homeBase: string | null;
}

/**
 * Look up a user by their sender email address.
 * Returns userId, their primary email, and home base city.
 */
export async function lookupUserBySenderEmail(
  senderEmail: string
): Promise<UserInfo | null> {
  const supabase = getSupabaseClient();

  // Find the user_emails entry
  const { data: emailEntry, error: emailError } = await supabase
    .from("user_emails")
    .select("user_id, email, is_primary")
    .eq("email", senderEmail.toLowerCase())
    .single();

  if (emailError || !emailEntry) {
    return null;
  }

  // Get user's primary email if this isn't it
  let primaryEmail = emailEntry.email;
  if (!emailEntry.is_primary) {
    const { data: primary } = await supabase
      .from("user_emails")
      .select("email")
      .eq("user_id", emailEntry.user_id)
      .eq("is_primary", true)
      .single();

    if (primary) {
      primaryEmail = primary.email;
    }
  }

  // Get user's home base from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("base_city")
    .eq("id", emailEntry.user_id)
    .single();

  return {
    userId: emailEntry.user_id,
    primaryEmail,
    homeBase: profile?.base_city ?? null,
  };
}

// ==========================================
// Existing events (for travel time context)
// ==========================================

export interface ExistingEvent {
  event_type: string;
  title: string;
  start_at: string;
  start_timezone: string;
  end_at: string;
  end_timezone: string;
  location: string | null;
  end_location: string | null;
}

/**
 * Fetch recent/upcoming events for a user to provide context for travel time estimates.
 * Returns events within ±14 days of now, sorted by start_at.
 */
export async function fetchUserEventsForContext(
  userId: string
): Promise<ExistingEvent[]> {
  const supabase = getSupabaseClient();
  const now = new Date();
  const twoWeeksBefore = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAfter = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("events")
    .select("event_type, title, start_at, start_timezone, end_at, end_timezone, location, end_location")
    .eq("user_id", userId)
    .gte("start_at", twoWeeksBefore)
    .lte("start_at", twoWeeksAfter)
    .order("start_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error("Failed to fetch existing events for context:", error);
    return [];
  }

  return (data ?? []) as ExistingEvent[];
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
  rawBody: string,
  userId: string
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
      user_id: userId,
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
  events: ParsedEvent[],
  userId: string
): Promise<SavedEvent[]> {
  const supabase = getSupabaseClient();
  const saved: SavedEvent[] = [];

  for (const event of events) {
    const { data, error } = await supabase
      .from("events")
      .insert({
        email_id: emailRowId,
        user_id: userId,
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
        // New fields
        address: event.address,
        terminal: event.terminal,
        gate: event.gate,
        passenger_names: event.passengerNames,
        provider: event.provider,
        arrive_by_minutes: event.arriveByMinutes,
        travel_from_previous_minutes: event.travelFromPreviousMinutes,
        leave_by_note: event.leaveByNote,
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
