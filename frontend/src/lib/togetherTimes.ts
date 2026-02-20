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
    return AIRPORT_CITY[codeMatch[1]];
  }

  // Try bare 3-letter code at end of string
  const bareMatch = location.match(/\b([A-Z]{3})$/);
  if (bareMatch && bareMatch[1] && AIRPORT_CITY[bareMatch[1]]) {
    return AIRPORT_CITY[bareMatch[1]];
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
// Location segments
// ============================================

/**
 * Build a timeline of where a user is located based on their events.
 * Each segment represents a period where the user is in a specific city.
 */
export function buildLocationSegments(
  events: CalendarEvent[],
  homeCity: string | null
): LocationSegment[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  const segments: LocationSegment[] = [];
  let currentCity = homeCity;
  let cityStartTime: Date | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i]!;
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);

    const isTransit = ["flight", "train", "ferry", "bus", "transfer"].includes(
      event.event_type
    );

    if (isTransit) {
      // Close current city segment at departure time
      if (currentCity && cityStartTime) {
        segments.push({
          city: currentCity,
          from: cityStartTime,
          to: eventStart,
        });
      }

      // Arrive at new city
      const arrivalCity = getArrivalCity(event);
      currentCity = arrivalCity;
      cityStartTime = eventEnd;
    } else {
      // Non-transit event — user is at this location
      const eventCity = extractCity(event.location);
      if (eventCity && eventCity !== currentCity) {
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

  // Close final segment — extend to a reasonable future
  if (currentCity && cityStartTime) {
    const lastEvent = sorted[sorted.length - 1]!;
    const lastEnd = new Date(lastEvent.end_at);
    // Extend segment to 3 days after last event, or until they presumably go home
    const segmentEnd = new Date(lastEnd.getTime() + 3 * 24 * 60 * 60 * 1000);
    segments.push({
      city: currentCity,
      from: cityStartTime,
      to: segmentEnd,
    });
  }

  return segments;
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
