import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { CalendarEvent, Profile } from "@/lib/types";
import {
  buildLocationSegments,
  findTogetherPeriods,
  computeGaps,
  type TogetherPeriod,
  type GapPeriod,
} from "@/lib/togetherTimes";

interface UseGroupTimelineOptions {
  userId?: string;
  showPast?: boolean;
}

interface ProfileMap {
  [userId: string]: Profile;
}

export function useGroupTimeline(options: UseGroupTimelineOptions) {
  const { userId, showPast = false } = options;
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

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
    const userIds = [...new Set((events ?? []).map((e) => e.user_id))];
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

  // Delete events
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

  return {
    allEvents,
    myEvents,
    partnerEvents,
    togetherPeriods,
    gaps,
    profiles,
    loading,
    error,
    deleteEvents,
    refetch: fetchData,
  };
}
