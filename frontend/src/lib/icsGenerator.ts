/**
 * Client-side ICS file generator.
 * Ported from supabase/functions/parse-booking/ics.ts, adapted for CalendarEvent type.
 */

import { formatInTimeZone } from "date-fns-tz";
import type { CalendarEvent } from "./types";
import { getVTimezone, hasTimezoneDefinition } from "./icsTimezones";

/**
 * Format a local datetime for ICS: "20260315T233500"
 */
function formatIcsDateTime(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyyMMdd'T'HHmmss");
}

/**
 * Generate a unique UID for an event.
 */
function generateUid(event: CalendarEvent): string {
  const slug = `${event.event_type}-${event.start_at}-${event.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .slice(0, 80);
  return `${slug}@calendar-helper`;
}

/**
 * Fold long ICS lines per RFC 5545 (max 75 octets per line).
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, 75));
  let remaining = line.slice(75);
  while (remaining.length > 0) {
    parts.push(" " + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return parts.join("\r\n");
}

/**
 * Escape text values per RFC 5545.
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Get alert minutes based on event type.
 */
function getAlertMinutes(eventType: string): number[] {
  switch (eventType) {
    case "flight":
      return [180, 1440];
    case "hotel":
      return [1440];
    case "train":
      return [60, 1440];
    default:
      return [60];
  }
}

/**
 * Generate a VEVENT block for a single CalendarEvent.
 */
function generateVEvent(event: CalendarEvent): string {
  const uid = generateUid(event);
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

  const startDate = new Date(event.start_at);
  const endDate = new Date(event.end_at);

  const lines: string[] = [];
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${now}`);

  // Start with timezone
  if (hasTimezoneDefinition(event.start_timezone)) {
    lines.push(
      `DTSTART;TZID=${event.start_timezone}:${formatIcsDateTime(startDate, event.start_timezone)}`
    );
  } else {
    lines.push(`DTSTART:${now.slice(0, 15)}Z`);
  }

  // End with timezone
  if (hasTimezoneDefinition(event.end_timezone)) {
    lines.push(
      `DTEND;TZID=${event.end_timezone}:${formatIcsDateTime(endDate, event.end_timezone)}`
    );
  } else {
    lines.push(`DTEND:${now.slice(0, 15)}Z`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.title)}`);

  // Location
  if (event.end_location) {
    lines.push(
      `LOCATION:${escapeIcsText(event.location ?? "")} \u2192 ${escapeIcsText(event.end_location)}`
    );
  } else if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  }

  // Description
  const descParts: string[] = [];
  if (event.booking_reference) {
    descParts.push(`Booking Ref: ${event.booking_reference}`);
  }
  if (event.event_type === "flight" && event.end_location) {
    descParts.push(`From: ${event.location ?? ""}`);
    descParts.push(`To: ${event.end_location}`);
  }
  if (event.notes) {
    descParts.push("", event.notes);
  }
  descParts.push("", "Created by Calendar Helper");
  lines.push(`DESCRIPTION:${escapeIcsText(descParts.join("\n"))}`);

  lines.push("STATUS:CONFIRMED");
  lines.push("TRANSP:OPAQUE");

  // Alarms
  for (const minutes of getAlertMinutes(event.event_type)) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    let trigger = "-PT";
    if (hours > 0) trigger += `${hours}H`;
    if (mins > 0) trigger += `${mins}M`;
    if (hours === 0 && mins === 0) trigger += "0M";

    lines.push("BEGIN:VALARM");
    lines.push(`TRIGGER:${trigger}`);
    lines.push("ACTION:DISPLAY");
    lines.push(
      `DESCRIPTION:${escapeIcsText(event.title)} in ${hours > 0 ? `${hours}h` : ""}${mins > 0 ? `${mins}m` : ""}`
    );
    lines.push("END:VALARM");
  }

  lines.push("END:VEVENT");
  return lines.map(foldLine).join("\r\n");
}

/**
 * Generate a complete .ics file for one or more CalendarEvents.
 */
export function generateIcs(events: CalendarEvent[]): string {
  // Collect all unique timezones needed
  const timezones = new Set<string>();
  for (const event of events) {
    if (hasTimezoneDefinition(event.start_timezone)) {
      timezones.add(event.start_timezone);
    }
    if (hasTimezoneDefinition(event.end_timezone)) {
      timezones.add(event.end_timezone);
    }
  }

  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//CalendarHelper//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");

  // Add VTIMEZONE definitions
  for (const tz of timezones) {
    const vtimezone = getVTimezone(tz);
    if (vtimezone) {
      lines.push(vtimezone);
    }
  }

  // Add events
  for (const event of events) {
    lines.push(generateVEvent(event));
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/**
 * Trigger a browser download of an ICS file.
 */
export function downloadIcs(events: CalendarEvent[], filename?: string): void {
  const content = generateIcs(events);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `calendar-helper-${events.length}-events.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
