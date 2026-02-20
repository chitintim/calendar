import type { CalendarEvent } from "@/lib/types";
import { getEventIcon, getEventTypeName } from "@/lib/eventIcons";
import {
  formatEventTime,
  formatEventDate,
  formatMustLeaveBy,
  getUrgencyStatus,
  getMustLeaveTime,
} from "@/lib/time";
import { useCountdown } from "@/hooks/useCountdown";
import { StatusBadge } from "./StatusBadge";

interface EventCardProps {
  event: CalendarEvent;
  showDate?: boolean;
  compact?: boolean;
  // Owner badge (for group timeline)
  ownerName?: string;
  ownerInitial?: string;
  ownerColor?: "blue" | "rose";
  // Selection mode
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const OWNER_COLORS = {
  blue: {
    bg: "bg-blue-100",
    text: "text-blue-700",
  },
  rose: {
    bg: "bg-rose-100",
    text: "text-rose-700",
  },
};

export function EventCard({
  event,
  showDate = true,
  compact = false,
  ownerName,
  ownerInitial,
  ownerColor = "blue",
  selectable = false,
  selected = false,
  onToggleSelect,
}: EventCardProps) {
  const urgency = getUrgencyStatus(event);
  const mustLeaveTime = getMustLeaveTime(event);
  const mustLeaveFormatted = formatMustLeaveBy(event);
  const countdownText = useCountdown(mustLeaveTime);

  const startTime = formatEventTime(event.start_at, event.start_timezone);
  const endTime = formatEventTime(event.end_at, event.end_timezone);
  const startDate = formatEventDate(event.start_at, event.start_timezone);

  const icon = getEventIcon(event.event_type);
  const typeName = getEventTypeName(event.event_type);

  const colors = OWNER_COLORS[ownerColor];

  const handleClick = () => {
    if (selectable && onToggleSelect) {
      onToggleSelect(event.id);
    }
  };

  if (compact) {
    return (
      <div
        className={`flex items-center gap-3 p-3 bg-white rounded-lg border transition-colors ${
          selectable ? "cursor-pointer" : ""
        } ${
          selected
            ? "border-red-300 bg-red-50"
            : "border-gray-200"
        }`}
        onClick={handleClick}
      >
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(event.id)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 flex-shrink-0"
          />
        )}
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{event.title}</p>
          <p className="text-sm text-gray-500">
            {startTime} - {endTime}
            {event.start_timezone !== event.end_timezone && (
              <span className="text-gray-400"> (local times)</span>
            )}
          </p>
        </div>
        {ownerInitial && (
          <span
            className={`flex-shrink-0 w-6 h-6 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center text-xs font-bold`}
            title={ownerName}
          >
            {ownerInitial}
          </span>
        )}
        <StatusBadge status={urgency} />
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-colors ${
        selectable ? "cursor-pointer" : ""
      } ${
        selected
          ? "border-red-300 ring-1 ring-red-200"
          : "border-gray-200"
      }`}
      onClick={handleClick}
    >
      {/* Header with type badge */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(event.id)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <span className="text-lg">{icon}</span>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {typeName}
          </span>
          {ownerInitial && (
            <span
              className={`w-5 h-5 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center text-[10px] font-bold`}
              title={ownerName}
            >
              {ownerInitial}
            </span>
          )}
        </div>
        <StatusBadge status={urgency} />
      </div>

      {/* Body */}
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-gray-900">{event.title}</h3>

        {showDate && (
          <p className="text-sm text-gray-600">{startDate}</p>
        )}

        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-gray-500">Depart:</span>{" "}
            <span className="font-medium">{startTime}</span>
          </div>
          <div>
            <span className="text-gray-500">Arrive:</span>{" "}
            <span className="font-medium">{endTime}</span>
            {event.start_timezone !== event.end_timezone && (
              <span className="text-gray-400 text-xs ml-1">(local)</span>
            )}
          </div>
        </div>

        {/* Location */}
        {event.location && (
          <p className="text-sm text-gray-600">
            {event.location}
            {event.end_location && ` \u2192 ${event.end_location}`}
          </p>
        )}

        {/* Booking reference */}
        {event.booking_reference && (
          <p className="text-xs text-gray-500">
            Ref: <span className="font-mono">{event.booking_reference}</span>
          </p>
        )}

        {/* Terminal & Gate */}
        {(event.terminal || event.gate) && (
          <p className="text-xs text-gray-500">
            {event.terminal && `Terminal: ${event.terminal}`}
            {event.terminal && event.gate && " \u00B7 "}
            {event.gate && `Gate: ${event.gate}`}
          </p>
        )}

        {/* Leave-by time */}
        {mustLeaveFormatted && urgency !== "past" && (
          <div className="mt-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-sm font-medium text-gray-700">
              Leave by {mustLeaveFormatted}
              {countdownText && (
                <span className={`ml-2 text-xs font-normal ${
                  urgency === "red"
                    ? "text-red-600"
                    : urgency === "amber"
                    ? "text-amber-600"
                    : "text-green-600"
                }`}>
                  ({countdownText})
                </span>
              )}
            </p>
            {event.leave_by_note && (
              <p className="text-xs text-gray-500 mt-0.5">
                {event.leave_by_note}
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        {event.notes && (
          <p className="text-xs text-gray-400 mt-2">{event.notes}</p>
        )}
      </div>
    </div>
  );
}
