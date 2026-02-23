import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

interface ProfileRow {
  id: string;
  display_name: string;
  base_city: string | null;
  base_timezone: string | null;
}

interface EventRow {
  id: string;
  user_id: string | null;
  event_type: string;
  title: string;
  start_at: string;
  end_at: string;
  start_timezone: string;
  end_timezone: string;
  location: string | null;
  end_location: string | null;
  city: string | null;
  end_city: string | null;
  booking_reference: string | null;
  notes: string | null;
  address: string | null;
  terminal: string | null;
  gate: string | null;
  provider: string | null;
}

// Event types that represent travel between places
const TRANSIT_TYPES = new Set(["flight", "train", "ferry", "bus", "transfer"]);

// Cities commonly used as transit hubs (layovers, not destinations)
const TRANSIT_HUB_CITIES = new Set([
  "abu dhabi", "dubai", "doha", "istanbul", "frankfurt", "amsterdam",
  "singapore", "kuala lumpur", "bangkok",
]);

interface DetectedTripInfo {
  signature: string; // e.g. "london:2026-03-03"
  cities: string[];
  startDate: string; // ISO date
  endDate: string;
}

/**
 * Lightweight server-side trip detection that mirrors the frontend algorithm.
 * Groups events per user into trips by tracking home/away transitions,
 * then computes trip signatures identical to the frontend's tripSignature().
 */
function detectTripsForContext(
  events: EventRow[],
  profileMap: Map<string, ProfileRow>,
): DetectedTripInfo[] {
  // Group events by user
  const byUser = new Map<string, EventRow[]>();
  for (const e of events) {
    if (!e.user_id) continue;
    const list = byUser.get(e.user_id) ?? [];
    list.push(e);
    byUser.set(e.user_id, list);
  }

  const allTrips: DetectedTripInfo[] = [];

  for (const [uid, userEvents] of byUser) {
    const profile = profileMap.get(uid);
    const homeNorm = profile?.base_city?.toLowerCase().trim() ?? null;
    if (!homeNorm) continue; // Need home city to detect trips

    const sorted = [...userEvents].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );

    let tripBuffer: EventRow[] = [];
    let isAway = false;

    for (const event of sorted) {
      const dest = TRANSIT_TYPES.has(event.event_type)
        ? event.end_city?.toLowerCase().trim()
        : (event.city?.toLowerCase().trim() ?? null);
      const isTransit = TRANSIT_TYPES.has(event.event_type);

      if (!isAway) {
        if ((isTransit || dest) && dest && dest !== homeNorm) {
          isAway = true;
          tripBuffer.push(event);
        }
      } else {
        tripBuffer.push(event);
        if (isTransit && dest === homeNorm) {
          const trip = buildTripInfo(tripBuffer, homeNorm);
          if (trip) allTrips.push(trip);
          tripBuffer = [];
          isAway = false;
        }
      }
    }

    if (tripBuffer.length > 0) {
      const trip = buildTripInfo(tripBuffer, homeNorm);
      if (trip) allTrips.push(trip);
    }
  }

  // Deduplicate by signature (multiple users may produce the same trip)
  const seen = new Set<string>();
  return allTrips.filter((t) => {
    if (seen.has(t.signature)) return false;
    seen.add(t.signature);
    return true;
  });
}

function buildTripInfo(events: EventRow[], homeNorm: string): DetectedTripInfo | null {
  // Extract unique destination cities (not home, filter transit hubs)
  const citySet = new Map<string, string>(); // normalized → display
  for (const e of events) {
    const dest = TRANSIT_TYPES.has(e.event_type)
      ? (e.end_city ?? null)
      : (e.city ?? null);
    if (!dest) continue;
    const norm = dest.toLowerCase().trim();
    if (norm !== homeNorm && !citySet.has(norm)) {
      citySet.set(norm, dest);
    }
  }

  // Filter out transit hubs with short stays
  const stayDurations = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const dest = TRANSIT_TYPES.has(events[i]!.event_type)
      ? events[i]!.end_city : events[i]!.city;
    if (!dest) continue;
    const norm = dest.toLowerCase().trim();
    const arrivalTime = new Date(events[i]!.end_at).getTime();
    const stayEnd = i + 1 < events.length
      ? new Date(events[i + 1]!.start_at).getTime()
      : arrivalTime;
    const stayHours = (stayEnd - arrivalTime) / (1000 * 60 * 60);
    stayDurations.set(norm, (stayDurations.get(norm) ?? 0) + stayHours);
  }

  const cities: string[] = [];
  for (const [norm, display] of citySet) {
    const stay = stayDurations.get(norm) ?? 0;
    if (stay >= 8 || !TRANSIT_HUB_CITIES.has(norm)) {
      cities.push(display);
    }
  }

  if (cities.length === 0 && citySet.size > 0) {
    cities.push([...citySet.values()][0]!);
  }
  if (cities.length === 0) return null;

  // Signature: sorted lowercase cities + ISO start date (same as frontend)
  const citiesKey = cities.map((c) => c.toLowerCase().trim()).sort().join(",");
  const startDate = events[0]!.start_at.split("T")[0]!;
  const endDate = events[events.length - 1]!.end_at.split("T")[0]!;

  return {
    signature: `${citiesKey}:${startDate}`,
    cities,
    startDate,
    endDate,
  };
}

/**
 * Build a structured text context of the group's itinerary for the AI.
 * Includes: group info, member profiles, chronological events, and computed together periods.
 */
export async function buildGroupContext(
  client: SupabaseClient,
  groupId: string,
): Promise<string> {
  // 1. Fetch group info
  const { data: group } = await client
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .single();

  // 2. Fetch member user IDs + profiles
  const { data: members } = await client
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);

  const memberUserIds = (members ?? []).map((m: { user_id: string }) => m.user_id);

  const { data: profiles } = await client
    .from("profiles")
    .select("id, display_name, base_city, base_timezone")
    .in("id", memberUserIds);

  const profileMap = new Map<string, ProfileRow>();
  for (const p of (profiles ?? []) as ProfileRow[]) {
    profileMap.set(p.id, p);
  }

  // 3. Fetch events: future + last 14 days
  const fourteenDaysAgo = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: events } = await client
    .from("events")
    .select(
      "id, user_id, event_type, title, start_at, end_at, start_timezone, end_timezone, location, end_location, city, end_city, booking_reference, notes, address, terminal, gate, provider",
    )
    .in("user_id", memberUserIds)
    .gte("end_at", fourteenDaysAgo)
    .order("start_at", { ascending: true })
    .limit(100);

  // 4. Build context string
  const now = new Date();
  const lines: string[] = [];

  lines.push(`Group: ${group?.name ?? "Unknown"}`);
  lines.push(`Today: ${now.toISOString().split("T")[0]}`);
  lines.push("");

  // Members
  lines.push("MEMBERS:");
  for (const uid of memberUserIds) {
    const p = profileMap.get(uid);
    if (!p) continue;
    let line = `- ${p.display_name}`;
    if (p.base_city) line += ` (based in ${p.base_city})`;
    if (p.base_timezone) line += ` [${p.base_timezone}]`;
    lines.push(line);
  }
  lines.push("");

  // Events
  lines.push("ITINERARY (recent + upcoming events):");
  for (const e of (events ?? []) as EventRow[]) {
    const owner = profileMap.get(e.user_id ?? "")?.display_name ?? "Unknown";
    const startDate = e.start_at.split("T")[0];
    const startTime = e.start_at.split("T")[1]?.slice(0, 5) ?? "";
    const endTime = e.end_at.split("T")[1]?.slice(0, 5) ?? "";

    const cities = e.end_city
      ? `${e.city ?? "?"} → ${e.end_city}`
      : (e.city ?? e.location ?? "");

    let line = `- [${e.id}] ${startDate} ${startTime}-${endTime} | ${e.event_type} | ${e.title} | ${cities} | ${owner}`;
    if (e.booking_reference) line += ` | Ref: ${e.booking_reference}`;
    if (e.provider) line += ` | ${e.provider}`;
    if (e.terminal) line += ` | Terminal ${e.terminal}`;
    if (e.gate) line += ` | Gate ${e.gate}`;
    if (e.address) line += ` | ${e.address}`;
    if (e.notes) line += ` | ${e.notes}`;
    lines.push(line);
  }

  if ((events ?? []).length === 0) {
    lines.push("  (no events found)");
  }

  // 5. Detect trips and show their signatures
  const detectedTrips = detectTripsForContext(
    (events ?? []) as EventRow[],
    profileMap,
  );

  if (detectedTrips.length > 0) {
    lines.push("");
    lines.push("DETECTED TRIPS (use these exact signatures for trip notes):");
    for (const trip of detectedTrips) {
      lines.push(`- [${trip.signature}] ${trip.cities.join(", ")} (${trip.startDate} to ${trip.endDate})`);
    }
  }

  // 6. Fetch trip notes
  const { data: tripNotes } = await client
    .from("timeline_comments")
    .select("trip_signature, content")
    .eq("group_id", groupId)
    .not("trip_signature", "is", null);

  if (tripNotes && tripNotes.length > 0) {
    lines.push("");
    lines.push("TRIP NOTES:");
    for (const tn of tripNotes as { trip_signature: string; content: string }[]) {
      lines.push(`- [${tn.trip_signature}] ${tn.content}`);
    }
  }

  let context = lines.join("\n");

  // Truncate if too long to stay within Claude context limits
  const MAX_CHARS = 12000;
  if (context.length > MAX_CHARS) {
    context = context.slice(0, MAX_CHARS) + "\n[...context truncated]";
  }

  return context;
}
