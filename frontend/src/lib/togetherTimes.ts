import type { CalendarEvent } from "./types";

// ============================================
// Types
// ============================================

export interface LocationSegment {
  city: string;
  from: Date;
  to: Date;
}

export interface TogetherPeriod {
  startAt: Date;
  endAt: Date;
  city: string;
  durationHours: number;
  users: string[]; // display names
}

export interface GapPeriod {
  startAt: Date;
  endAt: Date;
  durationHours: number;
  durationDays: number;
  lastCity: string | null;
  isAtHome: boolean;
}

// ============================================
// Airport → City mapping
// ============================================

const AIRPORT_CITY: Record<string, string> = {
  // Asia
  HKG: "Hong Kong",
  PEK: "Beijing",
  PVG: "Shanghai",
  SHA: "Shanghai",
  NRT: "Tokyo",
  HND: "Tokyo",
  KIX: "Osaka",
  ICN: "Seoul",
  GMP: "Seoul",
  TPE: "Taipei",
  SIN: "Singapore",
  KUL: "Kuala Lumpur",
  BKK: "Bangkok",
  CGK: "Jakarta",
  MNL: "Manila",
  DEL: "Delhi",
  BOM: "Mumbai",
  DXB: "Dubai",
  AUH: "Abu Dhabi",
  DOH: "Doha",
  SGN: "Ho Chi Minh City",
  HAN: "Hanoi",
  DAD: "Da Nang",
  // Europe
  LHR: "London",
  LGW: "London",
  STN: "London",
  LTN: "London",
  LCY: "London",
  CDG: "Paris",
  ORY: "Paris",
  FRA: "Frankfurt",
  MUC: "Munich",
  AMS: "Amsterdam",
  FCO: "Rome",
  MXP: "Milan",
  MAD: "Madrid",
  BCN: "Barcelona",
  IST: "Istanbul",
  ZRH: "Zurich",
  GVA: "Geneva",
  LIS: "Lisbon",
  CPH: "Copenhagen",
  OSL: "Oslo",
  ARN: "Stockholm",
  HEL: "Helsinki",
  VIE: "Vienna",
  PRG: "Prague",
  WAW: "Warsaw",
  BRU: "Brussels",
  DUB: "Dublin",
  EDI: "Edinburgh",
  ATH: "Athens",
  // Americas
  JFK: "New York",
  EWR: "New York",
  LGA: "New York",
  LAX: "Los Angeles",
  SFO: "San Francisco",
  ORD: "Chicago",
  MIA: "Miami",
  DFW: "Dallas",
  ATL: "Atlanta",
  BOS: "Boston",
  SEA: "Seattle",
  YYZ: "Toronto",
  YVR: "Vancouver",
  GRU: "Sao Paulo",
  MEX: "Mexico City",
  // Oceania
  SYD: "Sydney",
  MEL: "Melbourne",
  AKL: "Auckland",
  PER: "Perth",
  // Africa
  JNB: "Johannesburg",
  CPT: "Cape Town",
  CAI: "Cairo",
  NBO: "Nairobi",
};

/**
 * Extract a city name from a location string.
 * Tries airport code first, then falls back to text extraction.
 */
function extractCity(location: string | null): string | null {
  if (!location) return null;

  // Try to find a 3-letter airport code in parentheses like "(HKG)" or "(LHR)"
  const codeMatch = location.match(/\(([A-Z]{3})\)/);
  if (codeMatch && codeMatch[1] && AIRPORT_CITY[codeMatch[1]]) {
    return AIRPORT_CITY[codeMatch[1]]!;
  }

  // Try bare 3-letter code at end of string
  const bareMatch = location.match(/\b([A-Z]{3})$/);
  if (bareMatch && bareMatch[1] && AIRPORT_CITY[bareMatch[1]]) {
    return AIRPORT_CITY[bareMatch[1]]!;
  }

  // Try bare 3-letter code anywhere in the string (for "Terminal 1, HKG" patterns)
  const anyCodeMatch = location.match(/\b([A-Z]{3})\b/g);
  if (anyCodeMatch) {
    for (const code of anyCodeMatch) {
      if (AIRPORT_CITY[code]) return AIRPORT_CITY[code]!;
    }
  }

  // Try to extract city from "City Name" or "Hotel, City" patterns
  // For hotels/restaurants: "Hilton, London" → "London"
  const commaCity = location.match(/,\s*([^,]+)$/);
  if (commaCity && commaCity[1]) {
    return commaCity[1].trim();
  }

  // Return the location itself if short enough (likely a city name)
  if (location.length < 30) return location;

  return null;
}

/**
 * Get the arrival city from an event.
 */
function getArrivalCity(event: CalendarEvent): string | null {
  // For flights/trains/ferries/buses: use end_location
  if (event.end_location) {
    return extractCity(event.end_location);
  }
  // For hotels/restaurants/activities: use location
  return extractCity(event.location);
}

/**
 * Get the departure city from an event (where the user IS when it starts).
 */
function getDepartureCity(event: CalendarEvent): string | null {
  return extractCity(event.location);
}

// ============================================
// Constants
// ============================================

const TRANSIT_TYPES = new Set(["flight", "train", "ferry", "bus", "transfer"]);

// How far back/forward to extend home base segments
const LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const LOOKFORWARD_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

// Minimum hours for a city segment to be considered a real stay (not a layover)
const MIN_STAY_HOURS = 8;

// ============================================
// Location segments
// ============================================

/**
 * Detect consecutive transit events that form a multi-leg journey.
 * Groups flights that are within a few hours of each other (layover)
 * into a single journey from origin to final destination.
 *
 * Example: HKG → AUH (layover 2h) → LHR becomes one journey HKG → LHR.
 * The layover city (Abu Dhabi) is NOT treated as a location segment.
 */
function groupTransitLegs(sorted: CalendarEvent[]): Map<number, { skipSegment: boolean; finalArrivalCity: string | null; finalArrivalTime: Date }> {
  const transitGroups = new Map<number, { skipSegment: boolean; finalArrivalCity: string | null; finalArrivalTime: Date }>();

  let i = 0;
  while (i < sorted.length) {
    const event = sorted[i]!;
    if (!TRANSIT_TYPES.has(event.event_type)) {
      i++;
      continue;
    }

    // Start of a potential multi-leg journey
    let lastLeg = event;
    let j = i + 1;

    while (j < sorted.length) {
      const nextEvent = sorted[j]!;
      if (!TRANSIT_TYPES.has(nextEvent.event_type)) break;

      // Check if it's a layover (next departure within 8h of previous arrival)
      const prevArrival = new Date(lastLeg.end_at).getTime();
      const nextDeparture = new Date(nextEvent.start_at).getTime();
      const gapHours = (nextDeparture - prevArrival) / (1000 * 60 * 60);

      if (gapHours < MIN_STAY_HOURS && gapHours >= 0) {
        // This is a layover — mark intermediate legs as skippable
        transitGroups.set(j, {
          skipSegment: false, // The final leg is NOT skipped
          finalArrivalCity: getArrivalCity(nextEvent),
          finalArrivalTime: new Date(nextEvent.end_at),
        });
        // Mark the earlier legs as "skip" (don't create arrival segments for them)
        for (let k = i; k < j; k++) {
          if (TRANSIT_TYPES.has(sorted[k]!.event_type)) {
            transitGroups.set(k, {
              skipSegment: true,
              finalArrivalCity: getArrivalCity(nextEvent),
              finalArrivalTime: new Date(nextEvent.end_at),
            });
          }
        }
        lastLeg = nextEvent;
        j++;
      } else {
        break;
      }
    }

    i = j;
  }

  return transitGroups;
}

/**
 * Build a timeline of where a user is located based on their events.
 * Each segment represents a period where the user is in a specific city.
 *
 * Key features:
 * - Home base: if the user has a homeCity, creates home segments before first event
 *   and after last event (when they return home). If no events, one long home segment.
 * - Layover detection: consecutive transit with short gaps are grouped into one journey,
 *   so layover cities (e.g., Dubai, Abu Dhabi) don't create false segments.
 * - Transit inference: if a transit event departs from city X but user was last known
 *   in city Y, we infer they moved from Y→X at some point (creates an X segment).
 */
export function buildLocationSegments(
  events: CalendarEvent[],
  homeCity: string | null
): LocationSegment[] {
  const now = new Date();

  // If no events but we know their home city, they're at home
  if (events.length === 0) {
    if (!homeCity) return [];
    return [
      {
        city: homeCity,
        from: new Date(now.getTime() - LOOKBACK_MS),
        to: new Date(now.getTime() + LOOKFORWARD_MS),
      },
    ];
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  // Pre-compute multi-leg transit groupings
  const transitGroups = groupTransitLegs(sorted);

  const segments: LocationSegment[] = [];

  // ---- Pre-first-event home segment ----
  const firstEvent = sorted[0]!;
  const firstEventStart = new Date(firstEvent.start_at);
  const isFirstTransit = TRANSIT_TYPES.has(firstEvent.event_type);

  if (homeCity) {
    const homeSegmentStart = new Date(
      Math.min(now.getTime() - LOOKBACK_MS, firstEventStart.getTime() - LOOKBACK_MS)
    );
    if (isFirstTransit) {
      // Home until first departure
      segments.push({
        city: homeCity,
        from: homeSegmentStart,
        to: firstEventStart,
      });
    } else {
      // First event is non-transit (hotel, activity, etc.)
      const eventCity = extractCity(firstEvent.location);
      if (eventCity && normalizeCity(eventCity) !== normalizeCity(homeCity)) {
        segments.push({
          city: homeCity,
          from: homeSegmentStart,
          to: firstEventStart,
        });
      }
    }
  }

  // ---- Process events ----
  let currentCity = homeCity;
  let cityStartTime: Date | null = null;

  // If we created a pre-home segment, start tracking from that point
  if (homeCity && segments.length > 0) {
    if (isFirstTransit) {
      currentCity = null; // in transit
      cityStartTime = null;
    } else {
      currentCity = homeCity;
      cityStartTime = new Date(
        Math.min(now.getTime() - LOOKBACK_MS, firstEventStart.getTime() - LOOKBACK_MS)
      );
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i]!;
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);

    const isTransit = TRANSIT_TYPES.has(event.event_type);

    if (isTransit) {
      // Check if this leg is part of a multi-leg journey and should be skipped
      const transitInfo = transitGroups.get(i);
      if (transitInfo?.skipSegment) {
        // This is an intermediate leg (e.g., HKG→AUH in HKG→AUH→LHR).
        // Close current city segment at departure but don't create arrival segment.
        if (currentCity && cityStartTime) {
          segments.push({
            city: currentCity,
            from: cityStartTime,
            to: eventStart,
          });
        }
        currentCity = null;
        cityStartTime = null;
        continue;
      }

      // Departure city inference: if the transit departs from a different city
      // than where we think the user is, they must have traveled there
      const departureCity = getDepartureCity(event);
      if (
        departureCity &&
        currentCity &&
        normalizeCity(departureCity) !== normalizeCity(currentCity)
      ) {
        // User moved from currentCity to departureCity at some unrecorded point.
        // Close the currentCity segment, then create a segment in departureCity.
        if (cityStartTime) {
          // Don't let currentCity segment extend too long if there's a big gap
          const maxCurrentEnd = new Date(
            Math.min(
              eventStart.getTime(),
              cityStartTime.getTime() + 7 * 24 * 60 * 60 * 1000 // max 7 days extension
            )
          );
          segments.push({
            city: currentCity,
            from: cityStartTime,
            to: maxCurrentEnd,
          });

          // Create an inferred segment in the departure city
          if (maxCurrentEnd.getTime() < eventStart.getTime()) {
            segments.push({
              city: departureCity,
              from: maxCurrentEnd,
              to: eventStart,
            });
          }
        } else {
          // No previous city start — just note user was in departure city
          // This shouldn't normally happen but handle gracefully
        }
      } else if (currentCity && cityStartTime) {
        // Normal case: close current city segment at departure time
        segments.push({
          city: currentCity,
          from: cityStartTime,
          to: eventStart,
        });
      }

      // Arrive at new city (using final destination if multi-leg)
      const arrivalCity = transitInfo?.finalArrivalCity ?? getArrivalCity(event);
      const arrivalTime = transitInfo?.finalArrivalTime ?? eventEnd;
      currentCity = arrivalCity;
      cityStartTime = arrivalTime;
    } else {
      // Non-transit event — user is at this location
      const eventCity = extractCity(event.location);
      if (eventCity && (!currentCity || normalizeCity(eventCity) !== normalizeCity(currentCity))) {
        // City changed (maybe they traveled without a flight record)
        if (currentCity && cityStartTime) {
          segments.push({
            city: currentCity,
            from: cityStartTime,
            to: eventStart,
          });
        }
        currentCity = eventCity;
        cityStartTime = eventStart;
      } else if (!cityStartTime) {
        cityStartTime = eventStart;
      }
    }
  }

  // ---- Post-last-event segment ----
  if (currentCity && cityStartTime) {
    const lastEvent = sorted[sorted.length - 1]!;
    const lastEnd = new Date(lastEvent.end_at);

    // If user ended up back at home, extend generously into the future
    const isAtHome = homeCity && normalizeCity(currentCity) === normalizeCity(homeCity);
    const extensionMs = isAtHome ? LOOKFORWARD_MS : 3 * 24 * 60 * 60 * 1000; // 60 days if home, 3 days if away
    const segmentEnd = new Date(lastEnd.getTime() + extensionMs);

    segments.push({
      city: currentCity,
      from: cityStartTime,
      to: segmentEnd,
    });
  }

  // Deduplicate: merge overlapping segments in the same city
  return mergeLocationSegments(segments);
}

/**
 * Merge overlapping or adjacent location segments in the same city.
 */
function mergeLocationSegments(segments: LocationSegment[]): LocationSegment[] {
  if (segments.length <= 1) return segments;

  const sorted = [...segments].sort(
    (a, b) => a.from.getTime() - b.from.getTime()
  );

  const merged: LocationSegment[] = [{ ...sorted[0]! }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;

    if (
      normalizeCity(current.city) === normalizeCity(last.city) &&
      current.from.getTime() <= last.to.getTime()
    ) {
      // Overlapping or adjacent same-city segments → merge
      last.to = new Date(Math.max(last.to.getTime(), current.to.getTime()));
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

// ============================================
// Together periods
// ============================================

/**
 * Find periods where two users are in the same city at the same time.
 */
export function findTogetherPeriods(
  segmentsA: LocationSegment[],
  segmentsB: LocationSegment[],
  nameA: string,
  nameB: string
): TogetherPeriod[] {
  const periods: TogetherPeriod[] = [];

  for (const a of segmentsA) {
    for (const b of segmentsB) {
      // Same city?
      if (normalizeCity(a.city) !== normalizeCity(b.city)) continue;

      // Overlapping time?
      const overlapStart = new Date(
        Math.max(a.from.getTime(), b.from.getTime())
      );
      const overlapEnd = new Date(Math.min(a.to.getTime(), b.to.getTime()));

      if (overlapStart >= overlapEnd) continue;

      const durationHours =
        (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60);

      // Skip very short overlaps (< 4 hours, likely just transit)
      if (durationHours < 4) continue;

      periods.push({
        startAt: overlapStart,
        endAt: overlapEnd,
        city: a.city,
        durationHours,
        users: [nameA, nameB],
      });
    }
  }

  // Merge adjacent/overlapping periods in the same city
  return mergePeriods(periods);
}

function normalizeCity(city: string): string {
  return city.toLowerCase().trim();
}

function mergePeriods(periods: TogetherPeriod[]): TogetherPeriod[] {
  if (periods.length <= 1) return periods;

  const sorted = [...periods].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime()
  );

  const merged: TogetherPeriod[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;

    if (
      normalizeCity(current.city) === normalizeCity(last.city) &&
      current.startAt.getTime() <= last.endAt.getTime() + 4 * 60 * 60 * 1000 // 4h gap tolerance
    ) {
      // Merge
      last.endAt = new Date(
        Math.max(last.endAt.getTime(), current.endAt.getTime())
      );
      last.durationHours =
        (last.endAt.getTime() - last.startAt.getTime()) / (1000 * 60 * 60);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

// ============================================
// Gaps
// ============================================

/**
 * Compute gaps between consecutive events for a single user.
 * Only returns gaps > 6 hours (skip short layovers).
 */
export function computeGaps(
  events: CalendarEvent[],
  homeCity: string | null
): GapPeriod[] {
  if (events.length < 2) return [];

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  const gaps: GapPeriod[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1]!;

    const gapStart = new Date(current.end_at);
    const gapEnd = new Date(next.start_at);
    const diffMs = gapEnd.getTime() - gapStart.getTime();
    const durationHours = diffMs / (1000 * 60 * 60);

    // Skip gaps < 6 hours (layovers, short waits)
    if (durationHours < 6) continue;

    const lastCity = getArrivalCity(current) ?? getDepartureCity(current);
    const isAtHome = homeCity
      ? normalizeCity(lastCity ?? "") === normalizeCity(homeCity)
      : false;

    gaps.push({
      startAt: gapStart,
      endAt: gapEnd,
      durationHours,
      durationDays: durationHours / 24,
      lastCity,
      isAtHome,
    });
  }

  return gaps;
}
