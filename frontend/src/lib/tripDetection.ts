import type { CalendarEvent } from "./types";

/**
 * A detected trip: a cluster of events that form a coherent journey.
 */
export interface DetectedTrip {
  name: string;
  startDate: Date;
  endDate: Date;
  events: CalendarEvent[];
  cities: string[]; // unique cities visited
}

// Max gap between events in the same trip (in hours)
const MAX_GAP_HOURS = 48;

/**
 * Auto-detect trips by clustering events.
 *
 * Rules:
 * 1. Events are sorted chronologically
 * 2. Events within MAX_GAP_HOURS of each other are grouped into the same trip
 * 3. A trip must have at least 2 events, or 1 event that's away from home
 * 4. Trip name is derived from the cities visited (e.g., "London Trip", "London & Paris")
 *
 * Returns events partitioned into detected trips + ungrouped events.
 */
export function detectTrips(
  events: CalendarEvent[],
  homeCity: string | null
): { trips: DetectedTrip[]; ungrouped: CalendarEvent[] } {
  if (events.length === 0) return { trips: [], ungrouped: [] };

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  const clusters: CalendarEvent[][] = [];
  let current: CalendarEvent[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1]!;
    const next = sorted[i]!;
    const gapMs =
      new Date(next.start_at).getTime() - new Date(prev.end_at).getTime();
    const gapHours = gapMs / (1000 * 60 * 60);

    if (gapHours <= MAX_GAP_HOURS && gapHours >= 0) {
      current.push(next);
    } else {
      clusters.push(current);
      current = [next];
    }
  }
  clusters.push(current);

  const trips: DetectedTrip[] = [];
  const ungrouped: CalendarEvent[] = [];
  const homeCityNorm = homeCity?.toLowerCase().trim() ?? null;

  for (const cluster of clusters) {
    // Extract cities from events in this cluster
    const cities = extractCitiesFromEvents(cluster);
    const awayCities = homeCityNorm
      ? cities.filter((c) => c.toLowerCase().trim() !== homeCityNorm)
      : cities;

    // A trip needs: either 2+ events, or at least 1 away-from-home city
    const isTrip =
      cluster.length >= 2 || (awayCities.length > 0 && cluster.length >= 1);

    if (isTrip && awayCities.length > 0) {
      const startDate = new Date(cluster[0]!.start_at);
      const endDate = new Date(cluster[cluster.length - 1]!.end_at);
      const name = buildTripName(awayCities);

      trips.push({
        name,
        startDate,
        endDate,
        events: cluster,
        cities: awayCities,
      });
    } else {
      ungrouped.push(...cluster);
    }
  }

  return { trips, ungrouped };
}

/**
 * Extract unique city names from a set of events.
 */
function extractCitiesFromEvents(events: CalendarEvent[]): string[] {
  const cities = new Set<string>();

  for (const event of events) {
    // For transit: use end_location (destination)
    if (event.end_location) {
      const city = extractCityName(event.end_location);
      if (city) cities.add(city);
    }
    // Use location
    if (event.location) {
      const city = extractCityName(event.location);
      if (city) cities.add(city);
    }
  }

  return [...cities];
}

/**
 * Extract a readable city name from a location string.
 * Simplified version — pulls airport code cities or last comma segment.
 */
const AIRPORT_CITY: Record<string, string> = {
  HKG: "Hong Kong", LHR: "London", LGW: "London", STN: "London",
  CDG: "Paris", ORY: "Paris", FRA: "Frankfurt", AMS: "Amsterdam",
  JFK: "New York", LAX: "Los Angeles", SFO: "San Francisco",
  NRT: "Tokyo", HND: "Tokyo", SIN: "Singapore", BKK: "Bangkok",
  DXB: "Dubai", SYD: "Sydney", MEL: "Melbourne", ICN: "Seoul",
  TPE: "Taipei", KUL: "Kuala Lumpur", MXP: "Milan", FCO: "Rome",
  BCN: "Barcelona", MAD: "Madrid", LIS: "Lisbon", IST: "Istanbul",
  MUC: "Munich", ZRH: "Zurich", GVA: "Geneva",
  AUH: "Abu Dhabi", DOH: "Doha", DEL: "Delhi", BOM: "Mumbai",
  PEK: "Beijing", PVG: "Shanghai", KIX: "Osaka", SGN: "Ho Chi Minh City",
};

function extractCityName(location: string): string | null {
  // Try airport code
  const codeMatch = location.match(/\b([A-Z]{3})\b/g);
  if (codeMatch) {
    for (const code of codeMatch) {
      if (AIRPORT_CITY[code]) return AIRPORT_CITY[code]!;
    }
  }

  // Try "City Name" after last comma
  const commaCity = location.match(/,\s*([^,]+)$/);
  if (commaCity?.[1]) return commaCity[1].trim();

  // Short location = likely a city name
  if (location.length < 30) return location;

  return null;
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
