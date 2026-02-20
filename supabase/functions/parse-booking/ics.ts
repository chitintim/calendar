import { getVTimezone, hasTimezoneDefinition } from "./timezones.ts";
import type { ParsedEvent } from "./parser.ts";

/**
 * Format a local datetime string for ICS (strip punctuation).
 * Input:  "2026-03-15T23:35:00"
 * Output: "20260315T233500"
 */
function formatIcsDateTime(isoLocal: string): string {
  return isoLocal.replace(/[-:]/g, "").replace(/\.\d+$/, "");
}

/**
 * Generate a unique UID for an event.
 */
function generateUid(event: ParsedEvent, domain: string): string {
  const slug = `${event.type}-${event.startDateTime}-${event.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .slice(0, 80);
  return `${slug}@${domain}`;
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
      return [180, 1440]; // 3 hours + 24 hours
    case "hotel":
      return [1440]; // 24 hours
    case "train":
      return [60, 1440]; // 1 hour + 24 hours
    default:
      return [60]; // 1 hour
  }
}

/**
 * Generate a VEVENT block for a single event.
 */
function generateVEvent(event: ParsedEvent, domain: string): string {
  const uid = generateUid(event, domain);
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

  const lines: string[] = [];
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${now}`);

  // Start and end with timezone references
  if (hasTimezoneDefinition(event.startTimezone)) {
    lines.push(
      `DTSTART;TZID=${event.startTimezone}:${formatIcsDateTime(event.startDateTime)}`
    );
  } else {
    // Fallback: use UTC notation if we don't have the timezone definition
    lines.push(`DTSTART:${formatIcsDateTime(event.startDateTime)}Z`);
  }

  if (hasTimezoneDefinition(event.endTimezone)) {
    lines.push(
      `DTEND;TZID=${event.endTimezone}:${formatIcsDateTime(event.endDateTime)}`
    );
  } else {
    lines.push(`DTEND:${formatIcsDateTime(event.endDateTime)}Z`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.title)}`);

  // Location
  if (event.endLocation) {
    lines.push(
      `LOCATION:${escapeIcsText(event.location)} → ${escapeIcsText(event.endLocation)}`
    );
  } else {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  }

  // Description with booking details
  const descParts: string[] = [];
  if (event.bookingReference) {
    descParts.push(`Booking Ref: ${event.bookingReference}`);
  }
  if (event.type === "flight" && event.endLocation) {
    descParts.push(`From: ${event.location}`);
    descParts.push(`To: ${event.endLocation}`);
  }
  if (event.notes) {
    descParts.push("", event.notes);
  }
  descParts.push("", "Created by Calendar Helper");
  lines.push(`DESCRIPTION:${escapeIcsText(descParts.join("\n"))}`);

  lines.push("STATUS:CONFIRMED");
  lines.push("TRANSP:OPAQUE");

  // Alarms
  for (const minutes of getAlertMinutes(event.type)) {
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
 * Generate a complete .ics file for one or more events.
 * Returns the ICS content as a string.
 */
export function generateIcs(events: ParsedEvent[], domain: string): string {
  // Collect all unique timezones needed
  const timezones = new Set<string>();
  for (const event of events) {
    if (hasTimezoneDefinition(event.startTimezone)) {
      timezones.add(event.startTimezone);
    }
    if (hasTimezoneDefinition(event.endTimezone)) {
      timezones.add(event.endTimezone);
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
    lines.push(generateVEvent(event, domain));
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
