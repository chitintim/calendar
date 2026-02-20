import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { CalendarEvent } from "@/lib/types";

interface UseEventsOptions {
  userId?: string;
  futureOnly?: boolean;
  limit?: number;
}

export function useEvents(options: UseEventsOptions = {}) {
  const { userId, futureOnly = false, limit } = options;
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let query = supabase
      .from("events")
      .select("*")
      .eq("user_id", userId)
      .order("start_at", { ascending: true });

    if (futureOnly) {
      query = query.gte("start_at", new Date().toISOString());
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setEvents((data ?? []) as CalendarEvent[]);
    }
    setLoading(false);
  }, [userId, futureOnly, limit]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}

/**
 * Get the next upcoming event for a user.
 */
export function useNextEvent(userId: string | undefined) {
  return useEvents({ userId, futureOnly: true, limit: 1 });
}
