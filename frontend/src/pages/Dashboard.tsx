import { useMemo, useCallback, useState } from "react";
import { useEvents } from "@/hooks/useEvents";
import { useProfile } from "@/hooks/useProfile";
import { useCountdown } from "@/hooks/useCountdown";
import { useGroupTimeline } from "@/hooks/useGroupTimeline";
import { EventCard } from "@/components/EventCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar } from "@/components/Avatar";
import { getEventIcon } from "@/lib/eventIcons";
import type { CalendarEvent } from "@/lib/types";
import {
  formatEventTime,
  getUrgencyStatus,
  getMustLeaveTime,
} from "@/lib/time";

interface DashboardProps {
  userId: string;
}

// Helper: is an event happening today (in its local timezone)?
function isToday(event: CalendarEvent): boolean {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const eventStartDay = event.start_at.split("T")[0];
  const eventEndDay = event.end_at.split("T")[0];
  // Event spans today if it starts today, or started before today and ends today or later
  return eventStartDay === todayStr || (eventStartDay! <= todayStr! && eventEndDay! >= todayStr!);
}

// Helper: is an event currently in progress?
function isInProgress(event: CalendarEvent): boolean {
  const now = new Date();
  return new Date(event.start_at) <= now && new Date(event.end_at) > now;
}

export function Dashboard({ userId }: DashboardProps) {
  const { profile } = useProfile(userId);
  const { events: myUpcomingEvents, loading } = useEvents({
    userId,
    futureOnly: false,
    limit: 20,
  });

  const { allEvents, togetherPeriods, partnerEvents, profiles } =
    useGroupTimeline({ userId });

  // --- My events: today + next upcoming ---
  const { nextEvent, laterToday } = useMemo(() => {
    const now = new Date();
    // Get events that are relevant today (in progress or starting today)
    const today = myUpcomingEvents.filter(
      (e) => isToday(e) || isInProgress(e)
    );
    // Next future event (first one starting after now)
    const next = myUpcomingEvents.find(
      (e) => new Date(e.start_at) > now
    ) ?? null;
    // Events later today (future events today, excluding the very next one)
    const later = today.filter(
      (e) => new Date(e.start_at) > now && e.id !== next?.id
    );
    return { nextEvent: next, laterToday: later };
  }, [myUpcomingEvents]);

  // Current in-progress event (am I on a flight, at a hotel, etc.?)
  const currentEvent = useMemo(() => {
    return myUpcomingEvents.find((e) => isInProgress(e)) ?? null;
  }, [myUpcomingEvents]);

  // Together periods
  const nextTogether = useMemo(() => {
    const now = new Date();
    return togetherPeriods.find((p) => p.endAt > now) ?? null;
  }, [togetherPeriods]);

  const togetherCountdownText = useCountdown(
    nextTogether && nextTogether.startAt > new Date()
      ? nextTogether.startAt
      : null
  );

  const isCurrentlyTogether = useMemo(() => {
    if (!nextTogether) return false;
    const now = new Date();
    return nextTogether.startAt <= now && nextTogether.endAt > now;
  }, [nextTogether]);

  const togetherRemainingText = useCountdown(
    isCurrentlyTogether ? nextTogether!.endAt : null
  );

  // Together upcoming events
  const togetherUpcoming = useMemo(() => {
    if (!isCurrentlyTogether || !nextTogether) return [];
    const now = new Date();
    return allEvents
      .filter((e) => {
        const start = new Date(e.start_at);
        return start > now && start < nextTogether.endAt;
      })
      .slice(0, 5);
  }, [isCurrentlyTogether, nextTogether, allEvents]);

  // Partner
  const partnerUserId = useMemo(() => {
    if (partnerEvents.length > 0) return partnerEvents[0]!.user_id;
    return null;
  }, [partnerEvents]);

  const partnerProfile = useMemo(() => {
    if (!partnerUserId) return null;
    return profiles[partnerUserId] ?? null;
  }, [partnerUserId, profiles]);

  const partnerStatus = useMemo(() => {
    if (!partnerUserId) return null;
    const pProfile = profiles[partnerUserId];
    const pName = pProfile?.display_name ?? "Partner";
    const pHomeCity = pProfile?.base_city ?? null;
    const now = new Date();

    const pAllEvents = partnerEvents
      .filter((e) => e.user_id === partnerUserId)
      .sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );

    for (const ev of pAllEvents) {
      const start = new Date(ev.start_at);
      const end = new Date(ev.end_at);
      if (start <= now && end > now) {
        const minsLeft = Math.round(
          (end.getTime() - now.getTime()) / 60000
        );
        const hoursLeft = Math.floor(minsLeft / 60);
        const remainStr =
          hoursLeft > 0
            ? `${hoursLeft}h ${minsLeft % 60}m`
            : `${minsLeft}m`;

        if (ev.event_type === "flight") {
          const dest = ev.end_location || ev.location || "";
          return {
            emoji: "\u2708\uFE0F",
            text: `En route${dest ? ` to ${dest}` : ""}`,
            sub: `Landing in ${remainStr}`,
            name: pName,
          };
        }
        if (ev.event_type === "train") {
          const dest = ev.end_location || "";
          return {
            emoji: "\uD83D\uDE86",
            text: `On a train${dest ? ` to ${dest}` : ""}`,
            sub: `Arriving in ${remainStr}`,
            name: pName,
          };
        }
        if (ev.event_type === "hotel") {
          return {
            emoji: "\uD83C\uDFE8",
            text: `At ${ev.title}`,
            sub: ev.location ?? undefined,
            name: pName,
          };
        }
        if (
          ev.event_type === "activity" ||
          ev.event_type === "restaurant"
        ) {
          return {
            emoji:
              ev.event_type === "restaurant" ? "\uD83C\uDF7D\uFE0F" : "\uD83C\uDFAF",
            text: ev.title,
            sub: ev.location ?? undefined,
            name: pName,
          };
        }
        return {
          emoji: "\uD83D\uDCCD",
          text: ev.title,
          sub: `Ends in ${remainStr}`,
          name: pName,
        };
      }
    }

    const pastEvents = pAllEvents.filter(
      (e) => new Date(e.end_at) <= now
    );
    if (pastEvents.length > 0) {
      const lastEvent = pastEvents[pastEvents.length - 1]!;
      const arrivalCity = lastEvent.end_location
        ? lastEvent.end_location
        : lastEvent.location;
      if (arrivalCity) {
        const isHome =
          pHomeCity &&
          arrivalCity.toLowerCase().includes(pHomeCity.toLowerCase());
        return {
          emoji: isHome ? "\uD83C\uDFE0" : "\uD83D\uDCCD",
          text: isHome ? `Home in ${pHomeCity}` : `In ${arrivalCity}`,
          sub: undefined,
          name: pName,
        };
      }
    }

    if (pHomeCity) {
      return {
        emoji: "\uD83C\uDFE0",
        text: `Home in ${pHomeCity}`,
        sub: undefined,
        name: pName,
      };
    }

    return null;
  }, [partnerUserId, partnerEvents, profiles]);

  const partnerNextEvent = useMemo(() => {
    const now = new Date();
    return partnerEvents.find((e) => new Date(e.start_at) > now) ?? null;
  }, [partnerEvents]);

  // Next event urgency
  const mustLeaveTime = nextEvent ? getMustLeaveTime(nextEvent) : null;
  const urgency = nextEvent ? getUrgencyStatus(nextEvent) : null;
  const countdownText = useCountdown(
    nextEvent ? new Date(nextEvent.start_at) : null
  );
  const leaveCountdownText = useCountdown(mustLeaveTime);
  const isUrgentHero = urgency === "amber" || urgency === "red";

  // Copy to clipboard helper with brief "Copied!" feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);
  // Keep backward-compat wrapper for booking ref copies
  const copyRef = useCallback((ref: string) => {
    copyToClipboard(ref, `ref-${ref}`);
  }, [copyToClipboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Welcome */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {profile?.display_name
            ? `Hey, ${profile.display_name}`
            : "Dashboard"}
        </h1>
        {profile?.base_city && (
          <p className="text-sm text-gray-500 mt-0.5">
            Based in {profile.base_city}
          </p>
        )}
      </div>

      {/* ============================================================
          1. URGENCY HERO — when you need to leave NOW
          ============================================================ */}
      {isUrgentHero && nextEvent && mustLeaveTime && (
        <div
          className={`rounded-2xl border shadow-sm overflow-hidden ${
            urgency === "red"
              ? "bg-gradient-to-r from-red-50 to-red-100 border-red-300"
              : "bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-300"
          }`}
        >
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p
                className={`text-xs font-bold uppercase tracking-wide ${
                  urgency === "red" ? "text-red-500" : "text-amber-600"
                }`}
              >
                {urgency === "red" ? "Go now!" : "Get ready"}
              </p>
              <StatusBadge status={urgency!} size="md" />
            </div>
            <p
              className={`text-2xl font-bold ${
                urgency === "red" ? "text-red-700" : "text-amber-800"
              }`}
            >
              Leave in {leaveCountdownText}
            </p>
            {nextEvent.leave_by_note && (
              <p
                className={`text-sm mt-0.5 ${
                  urgency === "red" ? "text-red-600" : "text-amber-600"
                }`}
              >
                {nextEvent.leave_by_note}
              </p>
            )}
          </div>

          <div
            className={`px-4 py-2.5 border-t flex flex-wrap gap-2 text-xs ${
              urgency === "red"
                ? "border-red-200 text-red-700"
                : "border-amber-200 text-amber-700"
            }`}
          >
            <span className="font-medium">{nextEvent.title}</span>
            {nextEvent.terminal && (
              <span className="px-1.5 py-0.5 rounded bg-white/60 font-medium">
                T{nextEvent.terminal}
              </span>
            )}
            {nextEvent.gate && (
              <span className="px-1.5 py-0.5 rounded bg-white/60 font-medium">
                Gate {nextEvent.gate}
              </span>
            )}
            {nextEvent.booking_reference && (
              <button
                onClick={() => copyRef(nextEvent.booking_reference!)}
                className="px-1.5 py-0.5 rounded bg-white/60 font-mono font-medium hover:bg-white/80 transition-colors"
              >
                {nextEvent.booking_reference} {"\uD83D\uDCCB"}
              </button>
            )}
            {nextEvent.address && (
              <button
                onClick={() => copyToClipboard(nextEvent.address!, `hero-addr-${nextEvent.id}`)}
                className="px-1.5 py-0.5 rounded bg-white/60 font-medium hover:bg-white/80 transition-colors"
              >
                {copiedId === `hero-addr-${nextEvent.id}` ? "\u2705 Copied!" : `\uD83D\uDCCD ${nextEvent.address}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          2. CURRENTLY IN PROGRESS — "You're on BA245 to London"
          ============================================================ */}
      {currentEvent && !isUrgentHero && (
        <CurrentEventCard event={currentEvent} onCopyRef={copyRef} onCopyAddress={copyToClipboard} copiedId={copiedId} />
      )}

      {/* ============================================================
          3. TOGETHER STATUS
          ============================================================ */}
      {nextTogether && (
        <div className="bg-gradient-to-r from-rose-50 to-pink-50 rounded-2xl border border-rose-200 shadow-sm p-4">
          {isCurrentlyTogether ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{"\uD83D\uDC95"}</span>
                <h2 className="text-lg font-bold text-rose-800">
                  Together in {nextTogether.city}!
                </h2>
              </div>
              {togetherRemainingText && (
                <p className="text-xl font-bold text-rose-600">
                  {togetherRemainingText} left
                </p>
              )}
              <p className="text-rose-500 text-sm mt-1">
                {nextTogether.users.join(" & ")}
              </p>
              {togetherUpcoming.length > 0 && (
                <div className="mt-3 pt-3 border-t border-rose-200/50 space-y-1.5">
                  <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
                    Coming up this visit
                  </p>
                  {togetherUpcoming.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center gap-2 text-sm text-rose-700"
                    >
                      <span className="text-base flex-shrink-0">
                        {getEventIcon(ev.event_type)}
                      </span>
                      <span className="truncate">{ev.title}</span>
                      <span className="text-rose-400 text-xs ml-auto flex-shrink-0">
                        {formatEventTime(ev.start_at, ev.start_timezone)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{"\u2764\uFE0F"}</span>
                <h2 className="text-lg font-bold text-rose-800">
                  Together in {nextTogether.city}
                </h2>
              </div>
              {togetherCountdownText && (
                <p className="text-2xl font-bold text-rose-600">
                  in {togetherCountdownText}
                </p>
              )}
              <p className="text-rose-500 text-sm mt-1">
                {nextTogether.users.join(" & ")}
              </p>
            </>
          )}
        </div>
      )}

      {/* ============================================================
          4. NEXT EVENT — "What's my next move?"
          ============================================================ */}
      {nextEvent ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Next Up
              </p>
              <p className="text-xl font-bold text-gray-900">
                {countdownText}
              </p>
            </div>
            {urgency && !isUrgentHero && (
              <StatusBadge status={urgency} size="md" />
            )}
          </div>

          {/* Quick-access strip: booking ref, terminal, gate, address */}
          <QuickAccessStrip event={nextEvent} onCopyRef={copyRef} onCopyAddress={copyToClipboard} copiedId={copiedId} />

          <div className="border-t border-gray-100">
            <EventCard
              event={nextEvent}
              defaultExpanded={false}
              showDate
            />
          </div>

          {!isUrgentHero &&
            mustLeaveTime &&
            urgency &&
            urgency !== "past" && (
              <div className="px-4 py-2.5 border-t text-sm bg-gray-50 border-gray-100 text-gray-600">
                <span className="font-medium">
                  Leave in {leaveCountdownText}
                </span>
                {nextEvent.leave_by_note && (
                  <span className="text-xs ml-2 opacity-75">
                    {nextEvent.leave_by_note}
                  </span>
                )}
              </div>
            )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <span className="text-4xl">{"\uD83C\uDF34"}</span>
          <h2 className="mt-3 text-lg font-semibold text-gray-900">
            No upcoming events
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Forward a booking confirmation email to get started.
          </p>
        </div>
      )}

      {/* ============================================================
          5. LATER TODAY — rest of today's schedule
          ============================================================ */}
      {laterToday.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
              Later today
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {laterToday.map((ev) => (
              <TodayEventRow key={ev.id} event={ev} onCopyRef={copyRef} />
            ))}
          </div>
        </div>
      )}

      {/* ============================================================
          6. PARTNER STATUS
          ============================================================ */}
      {partnerProfile && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Avatar
              avatarUrl={partnerProfile.avatar_url}
              displayName={partnerProfile.display_name ?? "Partner"}
              size="sm"
              colorScheme="rose"
            />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                {partnerProfile.display_name ?? "Partner"}
              </span>
              {partnerStatus && (
                <p className="text-sm text-gray-600 truncate">
                  {partnerStatus.emoji} {partnerStatus.text}
                  {partnerStatus.sub && (
                    <span className="text-gray-400 text-xs ml-1">
                      {"\u00B7"} {partnerStatus.sub}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          {partnerNextEvent && <EventCard event={partnerNextEvent} />}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

/** Shows a prominent card for an event currently in progress */
function CurrentEventCard({
  event,
  onCopyRef,
  onCopyAddress,
  copiedId,
}: {
  event: CalendarEvent;
  onCopyRef: (ref: string) => void;
  onCopyAddress: (text: string, id: string) => void;
  copiedId: string | null;
}) {
  const now = new Date();
  const end = new Date(event.end_at);
  const minsLeft = Math.round((end.getTime() - now.getTime()) / 60000);
  const hoursLeft = Math.floor(minsLeft / 60);
  const remainStr =
    hoursLeft > 0 ? `${hoursLeft}h ${minsLeft % 60}m` : `${minsLeft}m`;

  const icon = getEventIcon(event.event_type);
  const isTransit = ["flight", "train", "ferry", "bus", "transfer"].includes(
    event.event_type
  );
  const destination = event.end_location || event.location || "";

  return (
    <div className="bg-gradient-to-r from-brand-50 to-blue-50 rounded-2xl border border-brand-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3">
        <p className="text-[10px] font-bold text-brand-400 uppercase tracking-wider mb-1">
          Right now
        </p>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-gray-900 truncate">
              {event.title}
            </p>
            {isTransit && destination && (
              <p className="text-sm text-brand-600">
                {event.event_type === "flight" ? "Landing" : "Arriving"} in{" "}
                {destination} {"\u00B7"} {remainStr} left
              </p>
            )}
            {!isTransit && (
              <p className="text-sm text-brand-600">
                {event.location && <span>{event.location} {"\u00B7"} </span>}
                {remainStr} remaining
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick-access details */}
      {(event.booking_reference ||
        event.terminal ||
        event.gate ||
        event.address) && (
        <div className="px-4 py-2 border-t border-brand-200/50 flex flex-wrap gap-2 text-xs text-brand-700">
          {event.booking_reference && (
            <button
              onClick={() => onCopyRef(event.booking_reference!)}
              className="px-2 py-1 rounded-md bg-white/70 font-mono font-semibold hover:bg-white transition-colors"
            >
              Ref: {event.booking_reference} {"\uD83D\uDCCB"}
            </button>
          )}
          {event.terminal && (
            <span className="px-2 py-1 rounded-md bg-white/70 font-semibold">
              Terminal {event.terminal}
            </span>
          )}
          {event.gate && (
            <span className="px-2 py-1 rounded-md bg-white/70 font-semibold">
              Gate {event.gate}
            </span>
          )}
          {event.address && (
            <button
              onClick={() => onCopyAddress(event.address!, `current-addr-${event.id}`)}
              className="px-2 py-1 rounded-md bg-white/70 font-medium hover:bg-white transition-colors"
            >
              {copiedId === `current-addr-${event.id}` ? "\u2705 Copied!" : `\uD83D\uDCCD ${event.address}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Quick-access strip showing booking ref, terminal, gate, address for an event */
function QuickAccessStrip({
  event,
  onCopyRef,
  onCopyAddress,
  copiedId,
}: {
  event: CalendarEvent;
  onCopyRef: (ref: string) => void;
  onCopyAddress: (text: string, id: string) => void;
  copiedId: string | null;
}) {
  const hasInfo =
    event.booking_reference ||
    event.terminal ||
    event.gate ||
    event.address;

  if (!hasInfo) return null;

  return (
    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-2 text-xs text-gray-600">
      {event.booking_reference && (
        <button
          onClick={() => onCopyRef(event.booking_reference!)}
          className="px-2 py-1 rounded-md bg-white border border-gray-200 font-mono font-semibold hover:bg-gray-50 transition-colors"
        >
          {event.booking_reference} {"\uD83D\uDCCB"}
        </button>
      )}
      {event.terminal && (
        <span className="px-2 py-1 rounded-md bg-white border border-gray-200 font-semibold">
          Terminal {event.terminal}
        </span>
      )}
      {event.gate && (
        <span className="px-2 py-1 rounded-md bg-white border border-gray-200 font-semibold">
          Gate {event.gate}
        </span>
      )}
      {event.address && (
        <button
          onClick={() => onCopyAddress(event.address!, `quick-addr-${event.id}`)}
          className="px-2 py-1 rounded-md bg-white border border-gray-200 font-medium hover:bg-gray-50 transition-colors"
        >
          {copiedId === `quick-addr-${event.id}` ? "\u2705 Copied!" : `\uD83D\uDCCD ${event.address}`}
        </button>
      )}
    </div>
  );
}

/** Compact row for a "later today" event — shows time, icon, title, and tap-to-copy ref */
function TodayEventRow({
  event,
  onCopyRef,
}: {
  event: CalendarEvent;
  onCopyRef: (ref: string) => void;
}) {
  const time = formatEventTime(event.start_at, event.start_timezone);
  const icon = getEventIcon(event.event_type);
  const destination =
    event.event_type === "flight" || event.event_type === "train"
      ? event.end_location || event.location
      : event.location;

  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <span className="text-xs font-mono text-gray-400 w-10 flex-shrink-0">
        {time}
      </span>
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {event.title}
        </p>
        {destination && (
          <p className="text-xs text-gray-400 truncate">{destination}</p>
        )}
      </div>
      {event.booking_reference && (
        <button
          onClick={() => onCopyRef(event.booking_reference!)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 font-mono text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0"
        >
          {event.booking_reference}
        </button>
      )}
    </div>
  );
}
