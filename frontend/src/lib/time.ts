import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { differenceInMinutes, isPast } from "date-fns";
import type { CalendarEvent, UrgencyStatus } from "./types";

/**
 * Convert a UTC timestamp + timezone to a local display string.
 */
export function formatEventTime(
  utcTimestamp: string,
  timezone: string,
  format: string = "HH:mm"
): string {
  return formatInTimeZone(new Date(utcTimestamp), timezone, format);
}

/**
 * Format a date in a timezone for display.
 */
export function formatEventDate(
  utcTimestamp: string,
  timezone: string,
  format: string = "EEE d MMM yyyy"
): string {
  return formatInTimeZone(new Date(utcTimestamp), timezone, format);
}

/**
 * Format date + time together.
 */
export function formatEventDateTime(
  utcTimestamp: string,
  timezone: string
): string {
  return formatInTimeZone(
    new Date(utcTimestamp),
    timezone,
    "EEE d MMM, HH:mm"
  );
}

/**
 * Calculate the "must leave by" time for an event.
 * mustLeaveAt = eventStart - arriveByMinutes - travelFromPreviousMinutes
 */
export function getMustLeaveTime(event: CalendarEvent): Date | null {
  const arriveBy = event.arrive_by_minutes ?? 0;
  const travel = event.travel_from_previous_minutes ?? 0;
  const totalMinutesBefore = arriveBy + travel;

  if (totalMinutesBefore === 0) return null;

  const startTime = new Date(event.start_at);
  return new Date(startTime.getTime() - totalMinutesBefore * 60 * 1000);
}

/**
 * Get urgency status relative to "must leave" time.
 * Green: >15 min until must-leave
 * Amber: 5-15 min until must-leave
 * Red: <5 min until must-leave
 * Past: must-leave time has passed
 */
export function getUrgencyStatus(event: CalendarEvent): UrgencyStatus {
  const mustLeave = getMustLeaveTime(event);
  if (!mustLeave) {
    // No travel time info — use event start time
    const start = new Date(event.start_at);
    if (isPast(start)) return "past";
    return "green";
  }

  if (isPast(mustLeave)) return "past";

  const minutesUntilLeave = differenceInMinutes(mustLeave, new Date());
  if (minutesUntilLeave < 5) return "red";
  if (minutesUntilLeave <= 15) return "amber";
  return "green";
}

/**
 * Format "must leave by" time as a human-readable string.
 */
export function formatMustLeaveBy(
  event: CalendarEvent
): string | null {
  const mustLeave = getMustLeaveTime(event);
  if (!mustLeave) return null;

  // Display in the event's start timezone
  return formatInTimeZone(mustLeave, event.start_timezone, "HH:mm");
}

/**
 * Get a human-readable countdown string.
 */
export function getCountdownText(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();

  if (diffMs <= 0) return "now";

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Calculate the number of calendar days between departure and arrival,
 * accounting for different timezones.
 *
 * Returns 0 for same-day, 1 for next-day arrival (+1), 2 for +2, etc.
 * Uses each time's LOCAL date in its own timezone.
 */
export function getArrivalDayOffset(
  startUtc: string,
  startTimezone: string,
  endUtc: string,
  endTimezone: string
): number {
  // Get local dates in each timezone
  const depLocal = formatInTimeZone(new Date(startUtc), startTimezone, "yyyy-MM-dd");
  const arrLocal = formatInTimeZone(new Date(endUtc), endTimezone, "yyyy-MM-dd");

  if (depLocal === arrLocal) return 0;

  // Parse dates and calculate difference
  const depDate = new Date(depLocal + "T00:00:00Z");
  const arrDate = new Date(arrLocal + "T00:00:00Z");
  const diffDays = Math.round(
    (arrDate.getTime() - depDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return diffDays;
}

/**
 * Format the arrival time with a +N day indicator if needed.
 * e.g., "15:45" or "15:45 +1" or "08:30 +2"
 */
export function formatArrivalTime(event: CalendarEvent): {
  time: string;
  dayOffset: number;
  arrivalDate: string | null;
} {
  const time = formatEventTime(event.end_at, event.end_timezone);
  const dayOffset = getArrivalDayOffset(
    event.start_at,
    event.start_timezone,
    event.end_at,
    event.end_timezone
  );

  const arrivalDate =
    dayOffset !== 0
      ? formatEventDate(event.end_at, event.end_timezone, "EEE d MMM")
      : null;

  return { time, dayOffset, arrivalDate };
}

/**
 * Check if an event is in the future.
 */
export function isFutureEvent(event: CalendarEvent): boolean {
  return new Date(event.start_at) > new Date();
}

/**
 * Get the local time in a specific timezone as a zoned Date.
 */
export function getZonedNow(timezone: string): Date {
  return toZonedTime(new Date(), timezone);
}
