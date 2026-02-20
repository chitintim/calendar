import { useState } from "react";
import { useEvents } from "@/hooks/useEvents";
import { EventCard } from "@/components/EventCard";
import { formatEventDate } from "@/lib/time";
import type { EventType, CalendarEvent } from "@/lib/types";
import { getEventIcon, getEventTypeName } from "@/lib/eventIcons";

interface TimelineProps {
  userId: string;
}

const ALL_TYPES: EventType[] = [
  "flight",
  "hotel",
  "train",
  "car_rental",
  "restaurant",
  "activity",
  "ferry",
  "bus",
  "transfer",
];

export function Timeline({ userId }: TimelineProps) {
  const { events, loading } = useEvents({ userId });
  const [showPast, setShowPast] = useState(false);
  const [filterType, setFilterType] = useState<EventType | "all">("all");

  // Filter events
  const now = new Date();
  let filtered = events;

  if (!showPast) {
    filtered = filtered.filter((e) => new Date(e.end_at) >= now);
  }

  if (filterType !== "all") {
    filtered = filtered.filter((e) => e.event_type === filterType);
  }

  // Group events by date
  const grouped = groupByDate(filtered);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Timeline</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Show past
          </label>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilterType("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filterType === "all"
              ? "bg-brand-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All
        </button>
        {ALL_TYPES.map((type) => {
          const hasEvents = events.some((e) => e.event_type === type);
          if (!hasEvents) return null;
          return (
            <button
              key={type}
              onClick={() =>
                setFilterType(filterType === type ? "all" : type)
              }
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterType === type
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {getEventIcon(type)} {getEventTypeName(type)}
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            {events.length === 0
              ? "No events yet. Forward a booking email to get started."
              : "No events match your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ date, events: dayEvents }) => (
            <div key={date}>
              {/* Date header */}
              <div className="sticky top-14 z-10 bg-gray-50 py-2">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  {date}
                </h2>
              </div>

              {/* Events for this date */}
              <div className="space-y-3 mt-2">
                {dayEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    showDate={false}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDate(
  events: CalendarEvent[]
): { date: string; events: CalendarEvent[] }[] {
  const groups: Map<string, CalendarEvent[]> = new Map();

  for (const event of events) {
    const dateStr = formatEventDate(
      event.start_at,
      event.start_timezone,
      "EEEE, d MMMM yyyy"
    );
    const existing = groups.get(dateStr);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(dateStr, [event]);
    }
  }

  return Array.from(groups.entries()).map(([date, events]) => ({
    date,
    events,
  }));
}
