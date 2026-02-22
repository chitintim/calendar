import { useState, useCallback } from "react";
import type { CalendarEvent } from "@/lib/types";
import { getEventIcon, getEventTypeName } from "@/lib/eventIcons";
import {
  formatEventTime,
  formatEventDate,
  formatMustLeaveBy,
  formatArrivalTime,
  getUrgencyStatus,
  getMustLeaveTime,
} from "@/lib/time";
import { useCountdown } from "@/hooks/useCountdown";
import { StatusBadge } from "./StatusBadge";
import { Avatar } from "./Avatar";

interface EventCardProps {
  event: CalendarEvent;
  showDate?: boolean;
  defaultExpanded?: boolean;
  // Owner badge (for group timeline)
  ownerName?: string;
  ownerInitial?: string;
  ownerColor?: "blue" | "rose";
  ownerAvatarUrl?: string | null;
  // Selection mode
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function EventCard({
  event,
  showDate = true,
  defaultExpanded = false,
  ownerName,
  ownerInitial,
  ownerColor = "blue",
  ownerAvatarUrl,
  selectable = false,
  selected = false,
  onToggleSelect,
}: EventCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const urgency = getUrgencyStatus(event);
  const mustLeaveTime = getMustLeaveTime(event);
  const mustLeaveFormatted = formatMustLeaveBy(event);
  const countdownText = useCountdown(mustLeaveTime);

  const startTime = formatEventTime(event.start_at, event.start_timezone);
  const arrival = formatArrivalTime(event);
  const startDate = formatEventDate(event.start_at, event.start_timezone);

  const icon = getEventIcon(event.event_type);
  const typeName = getEventTypeName(event.event_type);

  const hasDetails = !!(
    event.location ||
    event.booking_reference ||
    event.terminal ||
    event.gate ||
    event.address ||
    event.notes ||
    event.passenger_names?.length ||
    (mustLeaveFormatted && urgency !== "past")
  );

  const handleClick = useCallback(() => {
    if (selectable && onToggleSelect) {
      onToggleSelect(event.id);
      return;
    }
    if (hasDetails) {
      setExpanded((prev) => !prev);
    }
  }, [selectable, onToggleSelect, event.id, hasDetails]);

  const handleCopyRef = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (event.booking_reference) {
        navigator.clipboard.writeText(event.booking_reference);
      }
    },
    [event.booking_reference]
  );

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-colors ${
        selectable || hasDetails ? "cursor-pointer" : ""
      } ${
        selected
          ? "border-red-300 ring-1 ring-red-200"
          : "border-gray-200"
      }`}
      onClick={handleClick}
    >
      {/* Collapsed row — always visible */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(event.id)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate text-sm">
            {event.title}
          </p>
          <p className="text-xs text-gray-500">
            {startTime} – {arrival.time}
            {arrival.dayOffset > 0 && (
              <span className="text-amber-600 font-semibold"> +{arrival.dayOffset}</span>
            )}
            {showDate && (
              <span className="text-gray-400"> · {startDate}</span>
            )}
          </p>
        </div>
        {ownerInitial && (
          <Avatar
            avatarUrl={ownerAvatarUrl}
            displayName={ownerName ?? "?"}
            size="xs"
            colorScheme={ownerColor}
          />
        )}
        <StatusBadge status={urgency} />
        {hasDetails && !selectable && (
          <svg
            className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {/* Expandable details */}
      <div
        className={`grid transition-all duration-200 ease-in-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-0 space-y-2 border-t border-gray-100">
            <div className="pt-2" />

            {/* Type label */}
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              {typeName}
            </p>

            {/* Depart / Arrive details */}
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-gray-500">Depart:</span>{" "}
                <span className="font-medium">{startTime}</span>
              </div>
              <div>
                <span className="text-gray-500">Arrive:</span>{" "}
                <span className="font-medium">
                  {arrival.time}
                  {arrival.dayOffset > 0 && (
                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
                      +{arrival.dayOffset}
                    </span>
                  )}
                </span>
                {arrival.arrivalDate && (
                  <span className="text-gray-400 text-xs ml-1">({arrival.arrivalDate})</span>
                )}
                {!arrival.arrivalDate && event.start_timezone !== event.end_timezone && (
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

            {/* Terminal & Gate */}
            {(event.terminal || event.gate) && (
              <div className="flex items-center gap-3 text-sm">
                {event.terminal && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium text-xs">
                    Terminal {event.terminal}
                  </span>
                )}
                {event.gate && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium text-xs">
                    Gate {event.gate}
                  </span>
                )}
              </div>
            )}

            {/* Booking reference */}
            {event.booking_reference && (
              <button
                onClick={handleCopyRef}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <span>Ref:</span>
                <code className="font-mono font-semibold bg-gray-100 px-1.5 py-0.5 rounded">
                  {event.booking_reference}
                </code>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}

            {/* Address — tappable to open in maps */}
            {event.address && (
              <a
                href={`https://maps.apple.com/?q=${encodeURIComponent(event.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="underline underline-offset-2">{event.address}</span>
              </a>
            )}

            {/* Passenger names */}
            {event.passenger_names && event.passenger_names.length > 0 && (
              <p className="text-xs text-gray-500">
                Passengers: {event.passenger_names.join(", ")}
              </p>
            )}

            {/* Leave-by time */}
            {mustLeaveFormatted && urgency !== "past" && (
              <div className="p-2 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-sm font-medium text-gray-700">
                  Leave by {mustLeaveFormatted}
                  {countdownText && (
                    <span
                      className={`ml-2 text-xs font-normal ${
                        urgency === "red"
                          ? "text-red-600"
                          : urgency === "amber"
                          ? "text-amber-600"
                          : "text-green-600"
                      }`}
                    >
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
              <p className="text-xs text-gray-400">{event.notes}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
