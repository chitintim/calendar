import { useMemo } from "react";
import { useNextEvent } from "@/hooks/useEvents";
import { useProfile } from "@/hooks/useProfile";
import { useCountdown } from "@/hooks/useCountdown";
import { useGroupTimeline } from "@/hooks/useGroupTimeline";
import { EventCard } from "@/components/EventCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar } from "@/components/Avatar";
import {
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

  const { togetherPeriods, partnerEvents, profiles } = useGroupTimeline({
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

  const partnerProfile = useMemo(() => {
    if (!partnerNextEvent) return null;
    return profiles[partnerNextEvent.user_id] ?? null;
  }, [partnerNextEvent, profiles]);

  // Next event details
  const mustLeaveTime = nextEvent ? getMustLeaveTime(nextEvent) : null;
  const urgency = nextEvent ? getUrgencyStatus(nextEvent) : null;
  const countdownText = useCountdown(
    nextEvent ? new Date(nextEvent.start_at) : null
  );
  const leaveCountdownText = useCountdown(mustLeaveTime);

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

      {/* Together countdown / status — THE hero */}
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

      {/* Next event — merged compact card with countdown */}
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
            {urgency && <StatusBadge status={urgency} size="md" />}
          </div>

          {/* Event as collapsible card (inline, no extra border) */}
          <div className="border-t border-gray-100">
            <EventCard
              event={nextEvent}
              defaultExpanded={false}
              showDate
            />
          </div>

          {/* Leave-by (prominent when urgent) */}
          {mustLeaveTime && urgency !== "past" && (
            <div
              className={`px-4 py-2.5 border-t text-sm ${
                urgency === "red"
                  ? "bg-red-50 border-red-100 text-red-700"
                  : urgency === "amber"
                  ? "bg-amber-50 border-amber-100 text-amber-700"
                  : "bg-gray-50 border-gray-100 text-gray-600"
              }`}
            >
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

      {/* Partner's next event */}
      {partnerNextEvent && partnerProfile && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Avatar
              avatarUrl={partnerProfile.avatar_url}
              displayName={partnerProfile.display_name ?? "Partner"}
              size="sm"
              colorScheme="rose"
            />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              {partnerProfile.display_name ?? "Partner"}&apos;s Next
            </span>
          </div>
          <EventCard event={partnerNextEvent} />
        </div>
      )}
    </div>
  );
}
