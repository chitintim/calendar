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

  // 5. Fetch trip notes
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
