import { useState, useMemo, useCallback } from "react";
import { useGroupTimeline } from "@/hooks/useGroupTimeline";
import { EventCard } from "@/components/EventCard";
import { TogetherBand } from "@/components/TogetherBand";
import { GapIndicator } from "@/components/GapIndicator";
import { ActionBar } from "@/components/ActionBar";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { formatEventDate } from "@/lib/time";
import { downloadIcs } from "@/lib/icsGenerator";
import { detectTrips, type DetectedTrip } from "@/lib/tripDetection";
import type { EventType, CalendarEvent, Profile } from "@/lib/types";
import type { TogetherPeriod, GapPeriod } from "@/lib/togetherTimes";
import { getEventIcon, getEventTypeName } from "@/lib/eventIcons";

interface TimelineProps {
  userId: string;
}

type TimelineMode = "view" | "manage" | "export";

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

function getOwnerProps(
  event: CalendarEvent,
  userId: string,
  profiles: Record<string, Profile>
): { ownerName: string; ownerInitial: string; ownerColor: "blue" | "rose"; ownerAvatarUrl: string | null } {
  const isMe = event.user_id === userId;
  const profile = profiles[event.user_id];
  const name = profile?.display_name ?? (isMe ? "You" : "Partner");
  return {
    ownerName: name,
    ownerInitial: name[0]?.toUpperCase() ?? "?",
    ownerColor: isMe ? "blue" : "rose",
    ownerAvatarUrl: profile?.avatar_url ?? null,
  };
}

type TimelineItem =
  | { type: "date-header"; date: string; key: string }
  | { type: "event"; event: CalendarEvent; key: string }
  | { type: "together"; period: TogetherPeriod; key: string }
  | { type: "gap"; gap: GapPeriod; key: string };

function buildTimelineItems(
  events: CalendarEvent[],
  togetherPeriods: TogetherPeriod[],
  gaps: GapPeriod[],
  showGaps: boolean
): TimelineItem[] {
  const entries: { timestamp: number; sortOrder: number; item: TimelineItem }[] =
    [];

  let lastDateStr = "";
  for (const event of events) {
    const dateStr = formatEventDate(
      event.start_at,
      event.start_timezone,
      "EEEE, d MMMM yyyy"
    );
    if (dateStr !== lastDateStr) {
      entries.push({
        timestamp: new Date(event.start_at).getTime(),
        sortOrder: 0,
        item: { type: "date-header", date: dateStr, key: `date-${dateStr}` },
      });
      lastDateStr = dateStr;
    }
    entries.push({
      timestamp: new Date(event.start_at).getTime(),
      sortOrder: 1,
      item: { type: "event", event, key: `event-${event.id}` },
    });
  }

  for (let i = 0; i < togetherPeriods.length; i++) {
    const period = togetherPeriods[i]!;
    entries.push({
      timestamp: period.startAt.getTime(),
      sortOrder: -1,
      item: { type: "together", period, key: `together-${i}` },
    });
  }

  if (showGaps) {
    for (let i = 0; i < gaps.length; i++) {
      const gap = gaps[i]!;
      entries.push({
        timestamp: gap.startAt.getTime(),
        sortOrder: 2,
        item: { type: "gap", gap, key: `gap-${i}` },
      });
    }
  }

  entries.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.sortOrder - b.sortOrder;
  });

  return entries.map((e) => e.item);
}

// ---- Trip Section Component ----

interface TripSectionProps {
  trip: DetectedTrip;
  items: TimelineItem[];
  userId: string;
  profiles: Record<string, Profile>;
  hasPartnerEvents: boolean;
  mode: TimelineMode;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}

function TripSection({
  trip,
  items,
  userId,
  profiles,
  hasPartnerEvents,
  mode,
  selected,
  onToggleSelect,
}: TripSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const dateRange = formatTripDateRange(trip.startDate, trip.endDate);
  const eventCount = trip.events.length;

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/30 overflow-hidden">
      {/* Trip header — always visible, tap to collapse */}
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-brand-50/60 transition-colors"
      >
        <span className="text-base">🧳</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {trip.name}
          </p>
          <p className="text-[10px] text-gray-500">
            {dateRange} · {eventCount} event{eventCount !== 1 ? "s" : ""}
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
            collapsed ? "" : "rotate-180"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Trip events — collapsible */}
      <div
        className={`grid transition-all duration-200 ease-in-out ${
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-2 pb-2 space-y-2">
            {items.map((item) => {
              switch (item.type) {
                case "date-header":
                  return (
                    <div key={item.key} className="py-1">
                      <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                        {item.date}
                      </h2>
                    </div>
                  );

                case "event": {
                  const isSelectable = mode !== "view";
                  const isManageAndNotMine =
                    mode === "manage" && item.event.user_id !== userId;
                  const ownerProps = hasPartnerEvents
                    ? getOwnerProps(item.event, userId, profiles)
                    : undefined;

                  return (
                    <div
                      key={item.key}
                      className={isManageAndNotMine ? "opacity-40" : ""}
                    >
                      <EventCard
                        event={item.event}
                        showDate={false}
                        selectable={isSelectable && !isManageAndNotMine}
                        selected={selected.has(item.event.id)}
                        onToggleSelect={onToggleSelect}
                        ownerName={ownerProps?.ownerName}
                        ownerInitial={ownerProps?.ownerInitial}
                        ownerColor={ownerProps?.ownerColor}
                        ownerAvatarUrl={ownerProps?.ownerAvatarUrl}
                      />
                    </div>
                  );
                }

                case "together":
                  return (
                    <TogetherBand key={item.key} period={item.period} />
                  );

                case "gap":
                  return <GapIndicator key={item.key} gap={item.gap} />;

                default:
                  return null;
              }
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTripDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const startStr = start.toLocaleDateString("en-GB", opts);
  const endStr = end.toLocaleDateString("en-GB", opts);
  if (startStr === endStr) return startStr;
  // Same month? "3 – 10 Mar"
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} – ${endStr}`;
  }
  return `${startStr} – ${endStr}`;
}

// ---- Main Timeline ----

export function Timeline({ userId }: TimelineProps) {
  const [showPast, setShowPast] = useState(false);
  const [showGaps, setShowGaps] = useState(true);
  const [filterType, setFilterType] = useState<EventType | "all">("all");
  const [mode, setMode] = useState<TimelineMode>("view");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { allEvents, togetherPeriods, gaps, profiles, loading, deleteEvents } =
    useGroupTimeline({ userId, showPast });

  const myProfile = profiles[userId];

  const hasPartnerEvents = useMemo(
    () => allEvents.some((e) => e.user_id !== userId),
    [allEvents, userId]
  );

  const filtered = useMemo(() => {
    let result = allEvents;
    if (filterType !== "all") {
      result = result.filter((e) => e.event_type === filterType);
    }
    return result;
  }, [allEvents, filterType]);

  // Trip detection
  const { trips, ungrouped } = useMemo(
    () => detectTrips(filtered, myProfile?.base_city ?? null),
    [filtered, myProfile?.base_city]
  );

  // Build timeline items for each trip (with together bands & gaps scoped to trip period)
  const tripSections = useMemo(() => {
    return trips.map((trip) => {
      const tripEventIds = new Set(trip.events.map((e) => e.id));
      const tripTogether =
        filterType === "all"
          ? togetherPeriods.filter(
              (p) => p.startAt < trip.endDate && p.endAt > trip.startDate
            )
          : [];
      const tripGaps =
        filterType === "all"
          ? gaps.filter(
              (g) => g.startAt >= trip.startDate && g.endAt <= trip.endDate
            )
          : [];
      const items = buildTimelineItems(
        trip.events,
        tripTogether,
        tripGaps,
        showGaps
      );
      return { trip, items, eventIds: tripEventIds };
    });
  }, [trips, togetherPeriods, gaps, showGaps, filterType]);

  // Build timeline items for ungrouped events
  const ungroupedItems = useMemo(() => {
    if (ungrouped.length === 0) return [];
    const ungroupedTogether =
      filterType === "all"
        ? togetherPeriods.filter((p) => {
            // Only include together periods not already in a trip
            return !trips.some(
              (t) => p.startAt < t.endDate && p.endAt > t.startDate
            );
          })
        : [];
    const ungroupedGaps =
      filterType === "all"
        ? gaps.filter((g) => {
            return !trips.some(
              (t) => g.startAt >= t.startDate && g.endAt <= t.endDate
            );
          })
        : [];
    return buildTimelineItems(ungrouped, ungroupedTogether, ungroupedGaps, showGaps);
  }, [ungrouped, togetherPeriods, gaps, trips, showGaps, filterType]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectableEvents = useMemo(() => {
    if (mode === "manage") {
      return filtered.filter((e) => e.user_id === userId);
    }
    return filtered;
  }, [filtered, mode, userId]);

  const allSelected = useMemo(
    () =>
      selectableEvents.length > 0 &&
      selectableEvents.every((e) => selected.has(e.id)),
    [selectableEvents, selected]
  );

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableEvents.map((e) => e.id)));
    }
  }, [allSelected, selectableEvents]);

  const enterMode = useCallback((newMode: TimelineMode) => {
    setMode(newMode);
    setSelected(new Set());
  }, []);

  const exitMode = useCallback(() => {
    setMode("view");
    setSelected(new Set());
  }, []);

  const handleDelete = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setDeleting(true);
    const result = await deleteEvents(ids);
    setDeleting(false);
    if (!result.error) {
      setShowDeleteModal(false);
      setSelected(new Set());
      setMode("view");
    }
  }, [selected, deleteEvents]);

  const handleExport = useCallback(() => {
    const eventsToExport = filtered.filter((e) => selected.has(e.id));
    if (eventsToExport.length === 0) return;
    downloadIcs(eventsToExport);
  }, [filtered, selected]);

  const handleAction = useCallback(() => {
    if (mode === "manage") {
      setShowDeleteModal(true);
    } else if (mode === "export") {
      handleExport();
    }
  }, [mode, handleExport]);

  const selectedEvents = useMemo(
    () => filtered.filter((e) => selected.has(e.id)),
    [filtered, selected]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  const headerBg =
    mode === "manage"
      ? "bg-amber-50 border-amber-200"
      : mode === "export"
      ? "bg-blue-50 border-blue-200"
      : "";

  const hasNoEvents = allEvents.length === 0;
  const hasNoResults = filtered.length === 0 && !hasNoEvents;

  return (
    <div className={`space-y-3 ${mode !== "view" ? "pb-20" : ""}`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between ${
          mode !== "view" ? `rounded-xl p-3 border ${headerBg}` : ""
        }`}
      >
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {mode === "manage"
              ? "Delete events"
              : mode === "export"
              ? "Export events"
              : "Timeline"}
          </h1>
          {mode === "manage" && (
            <p className="text-xs text-amber-700 mt-0.5">
              Only your own events can be deleted
            </p>
          )}
        </div>

        {mode === "view" && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => enterMode("export")}
              className="p-2 text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
              title="Export"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              onClick={() => enterMode("manage")}
              className="p-2 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
              title="Manage"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Filters (view mode only) */}
      {mode === "view" && (
        <>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={showPast}
                onChange={(e) => setShowPast(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Past
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={showGaps}
                onChange={(e) => setShowGaps(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Gaps
            </label>
          </div>

          {/* Type filter pills — horizontally scrollable */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                filterType === "all"
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {ALL_TYPES.map((type) => {
              const hasEvents = allEvents.some((e) => e.event_type === type);
              if (!hasEvents) return null;
              return (
                <button
                  key={type}
                  onClick={() =>
                    setFilterType(filterType === type ? "all" : type)
                  }
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
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
        </>
      )}

      {/* Empty states */}
      {hasNoEvents && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-sm">
            No events yet. Forward a booking email to get started.
          </p>
        </div>
      )}
      {hasNoResults && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-sm">No events match your filters.</p>
        </div>
      )}

      {/* Trip sections */}
      {tripSections.map(({ trip, items }, i) => (
        <TripSection
          key={`trip-${i}`}
          trip={trip}
          items={items}
          userId={userId}
          profiles={profiles}
          hasPartnerEvents={hasPartnerEvents}
          mode={mode}
          selected={selected}
          onToggleSelect={toggleSelect}
        />
      ))}

      {/* Ungrouped events */}
      {ungroupedItems.length > 0 && (
        <div className="space-y-2">
          {trips.length > 0 && (
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">
              Other events
            </h2>
          )}
          {ungroupedItems.map((item) => {
            switch (item.type) {
              case "date-header":
                return (
                  <div
                    key={item.key}
                    className="sticky top-12 md:top-14 z-10 bg-gray-50 py-1.5"
                  >
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {item.date}
                    </h2>
                  </div>
                );

              case "event": {
                const isSelectable = mode !== "view";
                const isManageAndNotMine =
                  mode === "manage" && item.event.user_id !== userId;
                const ownerProps = hasPartnerEvents
                  ? getOwnerProps(item.event, userId, profiles)
                  : undefined;

                return (
                  <div
                    key={item.key}
                    className={isManageAndNotMine ? "opacity-40" : ""}
                  >
                    <EventCard
                      event={item.event}
                      showDate={false}
                      selectable={isSelectable && !isManageAndNotMine}
                      selected={selected.has(item.event.id)}
                      onToggleSelect={toggleSelect}
                      ownerName={ownerProps?.ownerName}
                      ownerInitial={ownerProps?.ownerInitial}
                      ownerColor={ownerProps?.ownerColor}
                      ownerAvatarUrl={ownerProps?.ownerAvatarUrl}
                    />
                  </div>
                );
              }

              case "together":
                return (
                  <TogetherBand key={item.key} period={item.period} />
                );

              case "gap":
                return <GapIndicator key={item.key} gap={item.gap} />;

              default:
                return null;
            }
          })}
        </div>
      )}

      {mode !== "view" && (
        <ActionBar
          selectedCount={selected.size}
          mode={mode}
          onAction={handleAction}
          onCancel={exitMode}
          onSelectAll={toggleSelectAll}
          allSelected={allSelected}
        />
      )}

      {showDeleteModal && (
        <ConfirmDeleteModal
          events={selectedEvents}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
