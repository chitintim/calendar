import type { CalendarEvent } from "./types";

/**
 * A detected trip: a cluster of events that form a coherent journey.
 */
export interface DetectedTrip {
  name: string;
  startDate: Date;
  endDate: Date;
  events: CalendarEvent[];
  cities: string[]; // unique destination cities (excluding home & transit hubs)
}

// ============================================
// Airport → City mapping (shared with togetherTimes.ts)
// ============================================

const AIRPORT_CITY: Record<string, string> = {
  // Asia
  HKG: "Hong Kong", PEK: "Beijing", PVG: "Shanghai", SHA: "Shanghai",
  NRT: "Tokyo", HND: "Tokyo", KIX: "Osaka", ICN: "Seoul", GMP: "Seoul",
  TPE: "Taipei", SIN: "Singapore", KUL: "Kuala Lumpur", BKK: "Bangkok",
  CGK: "Jakarta", MNL: "Manila", DEL: "Delhi", BOM: "Mumbai",
  DXB: "Dubai", AUH: "Abu Dhabi", DOH: "Doha",
  SGN: "Ho Chi Minh City", HAN: "Hanoi", DAD: "Da Nang",
  // Europe
  LHR: "London", LGW: "London", STN: "London", LTN: "London", LCY: "London",
  CDG: "Paris", ORY: "Paris", FRA: "Frankfurt", MUC: "Munich",
  AMS: "Amsterdam", FCO: "Rome", MXP: "Milan", MAD: "Madrid",
  BCN: "Barcelona", IST: "Istanbul", ZRH: "Zurich", GVA: "Geneva",
  LIS: "Lisbon", CPH: "Copenhagen", OSL: "Oslo", ARN: "Stockholm",
  HEL: "Helsinki", VIE: "Vienna", PRG: "Prague", WAW: "Warsaw",
  BRU: "Brussels", DUB: "Dublin", EDI: "Edinburgh", ATH: "Athens",
  // Americas
  JFK: "New York", EWR: "New York", LGA: "New York",
  LAX: "Los Angeles", SFO: "San Francisco", ORD: "Chicago",
  MIA: "Miami", DFW: "Dallas", ATL: "Atlanta", BOS: "Boston",
  SEA: "Seattle", YYZ: "Toronto", YVR: "Vancouver",
  GRU: "Sao Paulo", MEX: "Mexico City",
  // Oceania
  SYD: "Sydney", MEL: "Melbourne", AKL: "Auckland", PER: "Perth",
  // Africa
  JNB: "Johannesburg", CPT: "Cape Town", CAI: "Cairo", NBO: "Nairobi",
};

// Cities that are commonly transit hubs (not destinations)
const TRANSIT_HUB_CITIES = new Set([
  "abu dhabi", "dubai", "doha", "istanbul", "frankfurt", "amsterdam",
  "singapore", "kuala lumpur", "bangkok",
]);

// Event types that represent movement between places
const TRANSIT_TYPES = new Set(["flight", "train", "ferry", "bus", "transfer"]);

// ============================================
// City extraction
// ============================================

/**
 * Extract a city name from a location string.
 * Tries airport codes first (most reliable), then known city names,
 * then falls back to text patterns.
 */
function extractCity(location: string | null): string | null {
  if (!location) return null;

  // 1. Try airport code in parentheses: "(HKG)", "(LHR)"
  const parenMatch = location.match(/\(([A-Z]{3})\)/);
  if (parenMatch?.[1] && AIRPORT_CITY[parenMatch[1]]) {
    return AIRPORT_CITY[parenMatch[1]]!;
  }

  // 2. Try any 3-letter uppercase code anywhere
  const codeMatches = location.match(/\b([A-Z]{3})\b/g);
  if (codeMatches) {
    for (const code of codeMatches) {
      if (AIRPORT_CITY[code]) return AIRPORT_CITY[code]!;
    }
  }

  // 3. Try known city names embedded in the string (case-insensitive)
  const locationLower = location.toLowerCase();
  for (const city of Object.values(AIRPORT_CITY)) {
    if (locationLower.includes(city.toLowerCase())) {
      return city;
    }
  }

  // 4. Try "Venue, City" pattern — but only if city part is short
  const commaCity = location.match(/,\s*([^,]+)$/);
  if (commaCity?.[1]) {
    const candidate = commaCity[1].trim();
    // Reject things like "Terminal 1", "Terminal A", "Gate 5"
    if (!/^(terminal|gate|level|floor|hall)\b/i.test(candidate) && candidate.length < 30) {
      return candidate;
    }
  }

  // 5. Short string = probably a city
  if (location.length < 25) return location;

  return null;
}

/**
 * Get the destination city from an event.
 * Prefers the structured `end_city`/`city` columns, falling back to fuzzy extraction.
 */
function getDestinationCity(event: CalendarEvent): string | null {
  // Prefer structured city columns
  if (TRANSIT_TYPES.has(event.event_type) && event.end_city) {
    return event.end_city;
  }
  if (event.city && !TRANSIT_TYPES.has(event.event_type)) {
    return event.city;
  }

  // Fallback: extract from location strings
  if (TRANSIT_TYPES.has(event.event_type) && event.end_location) {
    return extractCity(event.end_location);
  }
  return extractCity(event.location);
}

// ============================================
// Trip detection
// ============================================

/**
 * Auto-detect trips by analyzing travel patterns.
 *
 * Algorithm:
 * 1. Find "away periods" — continuous stretches where the user is not at home.
 *    A period starts with a departure from home and ends with a return home.
 * 2. Group all events that fall within each away period into a trip.
 * 3. Events at home with no travel context become ungrouped.
 *
 * This correctly handles:
 * - Multi-leg journeys (HKG → AUH → LHR grouped as one outbound)
 * - Round trips (outbound + stay + return = one trip)
 * - Multiple destinations (London → Paris → London = one trip)
 */
export function detectTrips(
  events: CalendarEvent[],
  homeCity: string | null
): { trips: DetectedTrip[]; ungrouped: CalendarEvent[] } {
  if (events.length === 0) return { trips: [], ungrouped: [] };

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  const homeNorm = homeCity?.toLowerCase().trim() ?? null;

  // If we don't know the home city, fall back to simple date-gap clustering
  if (!homeNorm) {
    return clusterByDateGap(sorted, null);
  }

  // Phase 1: Find away periods by tracking home/away state
  const trips: DetectedTrip[] = [];
  const ungrouped: CalendarEvent[] = [];
  let tripBuffer: CalendarEvent[] = [];
  let isAway = false;

  for (const event of sorted) {
    const dest = getDestinationCity(event);
    const destNorm = dest?.toLowerCase().trim() ?? null;
    const isTransit = TRANSIT_TYPES.has(event.event_type);

    if (!isAway) {
      // Currently at home — look for departure
      if (isTransit && destNorm && destNorm !== homeNorm) {
        // Departing home! Start a new trip
        isAway = true;
        tripBuffer.push(event);
      } else if (!isTransit && destNorm && destNorm !== homeNorm) {
        // Non-transit event away from home (maybe they flew without us knowing)
        isAway = true;
        tripBuffer.push(event);
      } else {
        // Event at home — ungrouped
        ungrouped.push(event);
      }
    } else {
      // Currently away — add to trip, look for return home
      tripBuffer.push(event);

      // Check if this event returns us home
      if (isTransit && destNorm === homeNorm) {
        // Returned home! Close the trip
        flushTrip(tripBuffer, homeNorm, trips);
        tripBuffer = [];
        isAway = false;
      }
    }
  }

  // If still away at end, flush remaining events as a trip
  if (tripBuffer.length > 0) {
    flushTrip(tripBuffer, homeNorm, trips);
  }

  // Phase 2: Merge trips that overlap or are very close in time
  // (handles cases where events from multiple users interleave)
  const mergedTrips = mergeCloseTrips(trips);

  return { trips: mergedTrips, ungrouped };
}

/**
 * Convert a buffer of events into a DetectedTrip and add it to the list.
 */
function flushTrip(
  events: CalendarEvent[],
  homeNorm: string | null,
  trips: DetectedTrip[]
): void {
  if (events.length === 0) return;

  const cities = extractTripCities(events, homeNorm);
  if (cities.length === 0) return; // No identifiable away cities

  const startDate = new Date(events[0]!.start_at);
  const endDate = new Date(events[events.length - 1]!.end_at);

  trips.push({
    name: buildTripName(cities),
    startDate,
    endDate,
    events: [...events],
    cities,
  });
}

/**
 * Extract unique destination cities from trip events.
 * Excludes home city and transit hubs that appear only as layovers.
 */
function extractTripCities(
  events: CalendarEvent[],
  homeNorm: string | null
): string[] {
  const citySet = new Map<string, string>(); // normalized → display

  for (const event of events) {
    const dest = getDestinationCity(event);
    if (dest) {
      const norm = dest.toLowerCase().trim();
      if (norm !== homeNorm && !citySet.has(norm)) {
        citySet.set(norm, dest);
      }
    }
  }

  // Filter out pure transit hubs: cities that appear ONLY in transit events
  // and have a very short stay (user passes through but doesn't stay)
  const stayDurations = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const dest = getDestinationCity(events[i]!);
    if (!dest) continue;
    const norm = dest.toLowerCase().trim();

    // Find how long they stay: time from arriving at this city to next departure
    const arrivalTime = new Date(events[i]!.end_at).getTime();
    let stayEnd = arrivalTime;
    if (i + 1 < events.length) {
      stayEnd = new Date(events[i + 1]!.start_at).getTime();
    }
    const stayHours = (stayEnd - arrivalTime) / (1000 * 60 * 60);
    stayDurations.set(norm, (stayDurations.get(norm) ?? 0) + stayHours);
  }

  // Keep cities where user stays > 8h OR which are not known transit hubs
  const result: string[] = [];
  for (const [norm, display] of citySet) {
    const stay = stayDurations.get(norm) ?? 0;
    if (stay >= 8 || !TRANSIT_HUB_CITIES.has(norm)) {
      result.push(display);
    }
  }

  // If filtering removed everything, keep the primary destination
  if (result.length === 0 && citySet.size > 0) {
    result.push([...citySet.values()][0]!);
  }

  return result;
}

/**
 * Merge trips that overlap or are within 24h of each other.
 * This handles multi-user events that create overlapping trip boundaries.
 */
function mergeCloseTrips(trips: DetectedTrip[]): DetectedTrip[] {
  if (trips.length <= 1) return trips;

  const sorted = [...trips].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  );

  const merged: DetectedTrip[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;

    const gapMs = current.startDate.getTime() - last.endDate.getTime();
    const gapHours = gapMs / (1000 * 60 * 60);

    if (gapHours <= 24) {
      // Merge: extend end date, combine events and cities
      last.endDate = new Date(
        Math.max(last.endDate.getTime(), current.endDate.getTime())
      );
      last.events = [...last.events, ...current.events].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
      // Merge cities (deduplicated)
      const citySet = new Set(last.cities.map((c) => c.toLowerCase().trim()));
      for (const city of current.cities) {
        if (!citySet.has(city.toLowerCase().trim())) {
          last.cities.push(city);
          citySet.add(city.toLowerCase().trim());
        }
      }
      last.name = buildTripName(last.cities);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Fallback: cluster events by date proximity when no home city is known.
 */
function clusterByDateGap(
  sorted: CalendarEvent[],
  homeNorm: string | null
): { trips: DetectedTrip[]; ungrouped: CalendarEvent[] } {
  const MAX_GAP_DAYS = 7;
  const clusters: CalendarEvent[][] = [];
  let current: CalendarEvent[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1]!;
    const next = sorted[i]!;
    const gapMs =
      new Date(next.start_at).getTime() - new Date(prev.end_at).getTime();
    const gapDays = gapMs / (1000 * 60 * 60 * 24);

    if (gapDays <= MAX_GAP_DAYS && gapDays >= 0) {
      current.push(next);
    } else {
      clusters.push(current);
      current = [next];
    }
  }
  clusters.push(current);

  const trips: DetectedTrip[] = [];
  const ungrouped: CalendarEvent[] = [];

  for (const cluster of clusters) {
    if (cluster.length >= 2) {
      const cities = extractTripCities(cluster, homeNorm);
      if (cities.length > 0) {
        trips.push({
          name: buildTripName(cities),
          startDate: new Date(cluster[0]!.start_at),
          endDate: new Date(cluster[cluster.length - 1]!.end_at),
          events: cluster,
          cities,
        });
        continue;
      }
    }
    ungrouped.push(...cluster);
  }

  return { trips, ungrouped };
}

/**
 * Build a human-readable trip name from the cities.
 * "London" → "London Trip"
 * "London", "Paris" → "London & Paris"
 * "London", "Paris", "Rome" → "London, Paris & Rome"
 */
function buildTripName(cities: string[]): string {
  if (cities.length === 0) return "Trip";
  if (cities.length === 1) return `${cities[0]} Trip`;
  if (cities.length === 2) return `${cities[0]} & ${cities[1]}`;

  const last = cities[cities.length - 1];
  const rest = cities.slice(0, -1);
  return `${rest.join(", ")} & ${last}`;
}
