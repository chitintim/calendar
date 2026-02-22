import { useMemo } from "react";
import { useNextEvent } from "@/hooks/useEvents";
import { useProfile } from "@/hooks/useProfile";
import { useCountdown } from "@/hooks/useCountdown";
import { useGroupTimeline } from "@/hooks/useGroupTimeline";
import { EventCard } from "@/components/EventCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar } from "@/components/Avatar";
import { getEventIcon } from "@/lib/eventIcons";
import {
  formatEventTime,
  getUrgencyStatus,
  getMustLeaveTime,
} from "@/lib/time";

interface DashboardProps {
  userId: string;
}

export function Dashboard({ userId }: DashboardProps) {
  const { profile } = useProfile(userId);
  const { events: nextEvents, loading } = useNextEvent(userId);
  const nextEvent = nextEvents[0] ?? null;

  const { allEvents, togetherPeriods, partnerEvents, profiles } = useGroupTimeline({
    userId,
  });

  // Find the next future together period
  const nextTogether = useMemo(() => {
    const now = new Date();
    return togetherPeriods.find((p) => p.endAt > now) ?? null;
  }, [togetherPeriods]);

  const togetherCountdownText = useCountdown(
    nextTogether && nextTogether.startAt > new Date()
      ? nextTogether.startAt
      : null
  );

  // Currently together?
  const isCurrentlyTogether = useMemo(() => {
    if (!nextTogether) return false;
    const now = new Date();
    return nextTogether.startAt <= now && nextTogether.endAt > now;
  }, [nextTogether]);

  // Time remaining together
  const togetherRemainingText = useCountdown(
    isCurrentlyTogether ? nextTogether!.endAt : null
  );

  // Partner's next event
  const partnerNextEvent = useMemo(() => {
    const now = new Date();
    return (
      partnerEvents.find((e) => new Date(e.start_at) > now) ?? null
    );
  }, [partnerEvents]);

  // Find any partner user ID (from next event, or from any partner event)
  const partnerUserId = useMemo(() => {
    if (partnerNextEvent) return partnerNextEvent.user_id;
    if (partnerEvents.length > 0) return partnerEvents[0]!.user_id;
    return null;
  }, [partnerNextEvent, partnerEvents]);

  const partnerProfile = useMemo(() => {
    if (!partnerUserId) return null;
    return profiles[partnerUserId] ?? null;
  }, [partnerUserId, profiles]);

  // Next event details
  const mustLeaveTime = nextEvent ? getMustLeaveTime(nextEvent) : null;
  const urgency = nextEvent ? getUrgencyStatus(nextEvent) : null;
  const countdownText = useCountdown(
    nextEvent ? new Date(nextEvent.start_at) : null
  );
  const leaveCountdownText = useCountdown(mustLeaveTime);

  // Is urgency high enough to take over the hero?
  const isUrgentHero = urgency === "amber" || urgency === "red";

  // Partner status: derive from their events
  const partnerStatus = useMemo(() => {
    if (!partnerUserId) return null;
    const pProfile = profiles[partnerUserId];
    const pName = pProfile?.display_name ?? "Partner";
    const pHomeCity = pProfile?.base_city ?? null;
    const now = new Date();

    // Get ALL partner events (not just next future one)
    const pId = partnerUserId;
    const pAllEvents = partnerEvents
      .filter((e) => e.user_id === pId)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    // Check if partner is currently mid-event (in transit, at hotel, etc.)
    for (const ev of pAllEvents) {
      const start = new Date(ev.start_at);
      const end = new Date(ev.end_at);
      if (start <= now && end > now) {
        // Currently mid-event
        const minsLeft = Math.round((end.getTime() - now.getTime()) / 60000);
        const hoursLeft = Math.floor(minsLeft / 60);
        const remainStr = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft % 60}m` : `${minsLeft}m`;

        if (ev.event_type === "flight") {
          const dest = ev.end_location || ev.location || "";
          return { emoji: "✈️", text: `En route${dest ? ` to ${dest}` : ""}`, sub: `Landing in ${remainStr}`, name: pName };
        }
        if (ev.event_type === "train") {
          const dest = ev.end_location || "";
          return { emoji: "🚆", text: `On a train${dest ? ` to ${dest}` : ""}`, sub: `Arriving in ${remainStr}`, name: pName };
        }
        if (ev.event_type === "hotel") {
          return { emoji: "🏨", text: `At ${ev.title}`, sub: ev.location ?? undefined, name: pName };
        }
        if (ev.event_type === "activity" || ev.event_type === "restaurant") {
          return { emoji: ev.event_type === "restaurant" ? "🍽️" : "🎯", text: ev.title, sub: ev.location ?? undefined, name: pName };
        }
        // Generic in-progress
        return { emoji: "📍", text: ev.title, sub: `Ends in ${remainStr}`, name: pName };
      }
    }

    // Not mid-event — figure out where they are based on most recent past event
    const pastEvents = pAllEvents.filter((e) => new Date(e.end_at) <= now);
    if (pastEvents.length > 0) {
      const lastEvent = pastEvents[pastEvents.length - 1]!;
      const arrivalCity = lastEvent.end_location
        ? lastEvent.end_location
        : lastEvent.location;
      if (arrivalCity) {
        const isHome = pHomeCity && arrivalCity.toLowerCase().includes(pHomeCity.toLowerCase());
        return {
          emoji: isHome ? "🏠" : "📍",
          text: isHome ? `Home in ${pHomeCity}` : `In ${arrivalCity}`,
          sub: undefined,
          name: pName,
        };
      }
    }

    // Fallback: assume home
    if (pHomeCity) {
      return { emoji: "🏠", text: `Home in ${pHomeCity}`, sub: undefined, name: pName };
    }

    return null;
  }, [partnerUserId, partnerEvents, profiles]);

  // Events happening during current together period
  const togetherUpcoming = useMemo(() => {
    if (!isCurrentlyTogether || !nextTogether) return [];
    const now = new Date();
    return allEvents
      .filter((e) => {
        const start = new Date(e.start_at);
        return start > now && start < nextTogether.endAt;
      })
      .slice(0, 5); // cap at 5 events
  }, [isCurrentlyTogether, nextTogether, allEvents]);

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

      {/* URGENCY HERO — when leave-by is amber/red, this takes the top spot */}
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

          {/* Quick-glance details: terminal, gate, ref */}
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
                onClick={() =>
                  navigator.clipboard.writeText(nextEvent.booking_reference!)
                }
                className="px-1.5 py-0.5 rounded bg-white/60 font-mono font-medium hover:bg-white/80 transition-colors"
              >
                {nextEvent.booking_reference} 📋
              </button>
            )}
          </div>
        </div>
      )}

      {/* Together countdown / status — THE emotional hero (demoted if urgency is active) */}
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

              {/* Upcoming plans during this visit */}
              {togetherUpcoming.length > 0 && (
                <div className="mt-3 pt-3 border-t border-rose-200/50 space-y-1.5">
                  <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
                    Coming up this visit
                  </p>
                  {togetherUpcoming.map((ev) => (
                    <div key={ev.id} className="flex items-center gap-2 text-sm text-rose-700">
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

      {/* Next event — merged compact card with countdown (skip urgency banner if already shown as hero) */}
      {nextEvent ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Top section: countdown + urgency */}
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

          {/* Event as collapsible card (inline, no extra border) */}
          <div className="border-t border-gray-100">
            <EventCard
              event={nextEvent}
              defaultExpanded={false}
              showDate
            />
          </div>

          {/* Leave-by (only if NOT shown as urgency hero, and within actionable range) */}
          {!isUrgentHero && mustLeaveTime && urgency && urgency !== "past" && (
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

      {/* Partner status + next event */}
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
                      · {partnerStatus.sub}
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
