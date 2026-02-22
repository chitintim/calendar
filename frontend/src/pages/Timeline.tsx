import { useState, useMemo, useCallback } from "react";
import { useGroupTimeline } from "@/hooks/useGroupTimeline";
import { EventCard } from "@/components/EventCard";
import { TogetherBand } from "@/components/TogetherBand";
import { GapIndicator } from "@/components/GapIndicator";
import { ActionBar } from "@/components/ActionBar";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { formatEventDate } from "@/lib/time";
import { downloadIcs } from "@/lib/icsGenerator";
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

// Assign colors to users (current user blue, partner rose)
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

/**
 * Build a unified chronological list interleaving events, together bands, and gaps.
 */
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
  // Build entries with timestamps for sorting
  const entries: { timestamp: number; sortOrder: number; item: TimelineItem }[] =
    [];

  // Group events by date and add date headers
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

  // Add together bands
  for (let i = 0; i < togetherPeriods.length; i++) {
    const period = togetherPeriods[i]!;
    entries.push({
      timestamp: period.startAt.getTime(),
      sortOrder: -1, // bands before date headers at same time
      item: { type: "together", period, key: `together-${i}` },
    });
  }

  // Add gaps
  if (showGaps) {
    for (let i = 0; i < gaps.length; i++) {
      const gap = gaps[i]!;
      entries.push({
        timestamp: gap.startAt.getTime(),
        sortOrder: 2, // gaps after events at same time
        item: { type: "gap", gap, key: `gap-${i}` },
      });
    }
  }

  // Sort by timestamp, then by sortOrder
  entries.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.sortOrder - b.sortOrder;
  });

  return entries.map((e) => e.item);
}

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

  const hasPartnerEvents = useMemo(
    () => allEvents.some((e) => e.user_id !== userId),
    [allEvents, userId]
  );

  // Filter events
  const filtered = useMemo(() => {
    let result = allEvents;
    if (filterType !== "all") {
      result = result.filter((e) => e.event_type === filterType);
    }
    return result;
  }, [allEvents, filterType]);

  // Build unified timeline items
  const timelineItems = useMemo(
    () =>
      buildTimelineItems(
        filtered,
        filterType === "all" ? togetherPeriods : [],
        filterType === "all" ? gaps : [],
        showGaps
      ),
    [filtered, togetherPeriods, gaps, showGaps, filterType]
  );

  // Selection helpers
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
      // Can only delete own events
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

  // Mode switching
  const enterMode = useCallback((newMode: TimelineMode) => {
    setMode(newMode);
    setSelected(new Set());
  }, []);

  const exitMode = useCallback(() => {
    setMode("view");
    setSelected(new Set());
  }, []);

  // Delete handler
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

  // Export handler
  const handleExport = useCallback(() => {
    const eventsToExport = filtered.filter((e) => selected.has(e.id));
    if (eventsToExport.length === 0) return;
    downloadIcs(eventsToExport);
  }, [filtered, selected]);

  // Action bar action
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

  // Mode header styling
  const headerBg =
    mode === "manage"
      ? "bg-amber-50 border-amber-200"
      : mode === "export"
      ? "bg-blue-50 border-blue-200"
      : "";

  return (
    <div className={`space-y-6 ${mode !== "view" ? "pb-20" : ""}`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between ${
          mode !== "view" ? `rounded-xl p-4 border ${headerBg}` : ""
        }`}
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {mode === "manage"
              ? "Select events to delete"
              : mode === "export"
              ? "Select events to export"
              : "Timeline"}
          </h1>
          {mode === "manage" && (
            <p className="text-sm text-amber-700 mt-0.5">
              Only your own events can be deleted
            </p>
          )}
        </div>

        {mode === "view" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => enterMode("export")}
              className="px-3 py-1.5 text-sm font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
            >
              Export
            </button>
            <button
              onClick={() => enterMode("manage")}
              className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
            >
              Manage
            </button>
          </div>
        )}
      </div>

      {/* Filters (view mode only) */}
      {mode === "view" && (
        <>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showPast}
                onChange={(e) => setShowPast(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Past events
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showGaps}
                onChange={(e) => setShowGaps(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Gaps
            </label>
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
              const hasEvents = allEvents.some((e) => e.event_type === type);
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
        </>
      )}

      {/* Timeline */}
      {timelineItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            {allEvents.length === 0
              ? "No events yet. Forward a booking email to get started."
              : "No events match your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {timelineItems.map((item) => {
            switch (item.type) {
              case "date-header":
                return (
                  <div
                    key={item.key}
                    className="sticky top-14 z-10 bg-gray-50 py-2"
                  >
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
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

      {/* Action bar for manage/export modes */}
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

      {/* Delete confirmation modal */}
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
