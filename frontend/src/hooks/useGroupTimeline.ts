import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { CalendarEvent, Profile } from "@/lib/types";
import {
  buildLocationSegments,
  findTogetherPeriods,
  computeGaps,
  type TogetherPeriod,
} from "@/lib/togetherTimes";

interface UseGroupTimelineOptions {
  userId?: string;
  showPast?: boolean;
}

interface ProfileMap {
  [userId: string]: Profile;
}

interface TripNoteEntry {
  id: string;
  content: string;
}

export function useGroupTimeline(options: UseGroupTimelineOptions) {
  const { userId, showPast = false } = options;
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [groupId, setGroupId] = useState<string | null>(null);
  const [tripNotes, setTripNotes] = useState<Map<string, TripNoteEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch group membership to get groupId (needed for trip notes)
    const { data: memberRow } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    const gId = memberRow?.group_id ?? null;
    setGroupId(gId);

    // Fetch ALL events visible to this user (RLS handles group visibility)
    let query = supabase
      .from("events")
      .select("*")
      .order("start_at", { ascending: true });

    if (!showPast) {
      query = query.gte("end_at", new Date().toISOString());
    }

    const { data: events, error: eventsErr } = await query;

    if (eventsErr) {
      setError(eventsErr.message);
      setLoading(false);
      return;
    }

    setAllEvents((events ?? []) as CalendarEvent[]);

    // Get unique user IDs from events and fetch their profiles
    const userIds = [...new Set((events ?? []).map((e) => e.user_id).filter((id): id is string => id !== null))];
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);

      const map: ProfileMap = {};
      for (const p of profileData ?? []) {
        map[p.id] = p as Profile;
      }
      setProfiles(map);
    }

    // Fetch trip notes for this group
    if (gId) {
      const { data: noteRows } = await supabase
        .from("timeline_comments")
        .select("id, trip_signature, content")
        .eq("group_id", gId)
        .not("trip_signature", "is", null);

      const noteMap = new Map<string, TripNoteEntry>();
      for (const row of noteRows ?? []) {
        if (row.trip_signature) {
          noteMap.set(row.trip_signature, { id: row.id, content: row.content });
        }
      }
      setTripNotes(noteMap);
    }

    setLoading(false);
  }, [userId, showPast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Partition events by user
  const myEvents = useMemo(
    () => allEvents.filter((e) => e.user_id === userId),
    [allEvents, userId]
  );

  const partnerEvents = useMemo(
    () => allEvents.filter((e) => e.user_id !== userId),
    [allEvents, userId]
  );

  // Compute together periods
  const togetherPeriods = useMemo(() => {
    if (!userId || partnerEvents.length === 0) return [];

    const myProfile = profiles[userId];
    const partnerUserIds = [...new Set(partnerEvents.map((e) => e.user_id))];

    const allPeriods: TogetherPeriod[] = [];
    for (const partnerId of partnerUserIds) {
      const partnerProfile = profiles[partnerId];
      const pEvents = partnerEvents.filter((e) => e.user_id === partnerId);

      const mySegments = buildLocationSegments(
        myEvents,
        myProfile?.base_city ?? null
      );
      const partnerSegments = buildLocationSegments(
        pEvents,
        partnerProfile?.base_city ?? null
      );

      const periods = findTogetherPeriods(
        mySegments,
        partnerSegments,
        myProfile?.display_name ?? "You",
        partnerProfile?.display_name ?? "Partner"
      );
      allPeriods.push(...periods);
    }

    return allPeriods.sort(
      (a, b) => a.startAt.getTime() - b.startAt.getTime()
    );
  }, [myEvents, partnerEvents, profiles, userId]);

  // Compute gaps in the combined timeline
  const gaps = useMemo(() => {
    if (!userId) return [];
    const myProfile = profiles[userId];
    return computeGaps(myEvents, myProfile?.base_city ?? null);
  }, [myEvents, profiles, userId]);

  // Delete events (bulk)
  const deleteEvents = useCallback(
    async (eventIds: string[]) => {
      const { error: delErr } = await supabase
        .from("events")
        .delete()
        .in("id", eventIds);

      if (delErr) return { error: delErr.message };
      await fetchData();
      return {};
    },
    [fetchData]
  );

  // Delete single event (optimistic)
  const deleteEvent = useCallback(
    async (eventId: string) => {
      setAllEvents((prev) => prev.filter((e) => e.id !== eventId));
      const { error: delErr } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId);

      if (delErr) {
        console.error("Failed to delete event:", delErr);
        await fetchData();
      }
    },
    [fetchData]
  );

  // Update trip note (upsert into timeline_comments)
  const updateTripNote = useCallback(
    async (signature: string, note: string) => {
      if (!userId || !groupId) return;

      const existing = tripNotes.get(signature);
      const trimmed = note.trim();

      // Optimistic update
      if (trimmed) {
        setTripNotes((prev) => {
          const next = new Map(prev);
          next.set(signature, { id: existing?.id ?? "pending", content: trimmed });
          return next;
        });
      } else {
        setTripNotes((prev) => {
          const next = new Map(prev);
          next.delete(signature);
          return next;
        });
      }

      if (existing?.id && existing.id !== "pending") {
        if (trimmed) {
          // Update existing row
          const { error: updateErr } = await supabase
            .from("timeline_comments")
            .update({ content: trimmed })
            .eq("id", existing.id);
          if (updateErr) {
            console.error("Failed to update trip note:", updateErr);
            await fetchData();
          }
        } else {
          // Delete the row if note is empty
          const { error: deleteErr } = await supabase
            .from("timeline_comments")
            .delete()
            .eq("id", existing.id);
          if (deleteErr) {
            console.error("Failed to delete trip note:", deleteErr);
            await fetchData();
          }
        }
      } else if (trimmed) {
        // Insert new row
        const { data: inserted, error: insertErr } = await supabase
          .from("timeline_comments")
          .insert({
            group_id: groupId,
            user_id: userId,
            trip_signature: signature,
            content: trimmed,
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("Failed to insert trip note:", insertErr);
          await fetchData();
        } else if (inserted) {
          // Update the local entry with the real ID
          setTripNotes((prev) => {
            const next = new Map(prev);
            next.set(signature, { id: inserted.id, content: trimmed });
            return next;
          });
        }
      }
    },
    [userId, groupId, tripNotes, fetchData]
  );

  // Update event note (optimistic update + persist)
  const updateEventNote = useCallback(
    async (eventId: string, note: string) => {
      // Optimistic: update local state immediately
      setAllEvents((prev) =>
        prev.map((e) =>
          e.id === eventId ? { ...e, notes: note || null } : e
        )
      );

      const { error: updateErr } = await supabase
        .from("events")
        .update({ notes: note || null })
        .eq("id", eventId);

      if (updateErr) {
        console.error("Failed to update note:", updateErr);
        await fetchData(); // Revert on error
      }
    },
    [fetchData]
  );

  return {
    allEvents,
    myEvents,
    partnerEvents,
    togetherPeriods,
    gaps,
    profiles,
    groupId,
    tripNotes,
    loading,
    error,
    deleteEvents,
    deleteEvent,
    updateEventNote,
    updateTripNote,
    refetch: fetchData,
  };
}
