import { useNextEvent } from "@/hooks/useEvents";
import { useProfile } from "@/hooks/useProfile";
import { useCountdown } from "@/hooks/useCountdown";
import { EventCard } from "@/components/EventCard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  formatEventDateTime,
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
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
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

      {/* Next event hero */}
      {nextEvent ? (
        <div className="space-y-4">
          {/* Countdown hero */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Next Up
              </h2>
              {urgency && <StatusBadge status={urgency} size="md" />}
            </div>

            <p className="text-3xl font-bold text-gray-900 mb-1">
              {countdownText}
            </p>
            <p className="text-gray-600">
              {formatEventDateTime(
                nextEvent.start_at,
                nextEvent.start_timezone
              )}
            </p>

            {/* Leave-by countdown */}
            {mustLeaveTime && urgency !== "past" && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Leave in{" "}
                  <span
                    className={`font-semibold ${
                      urgency === "red"
                        ? "text-red-600"
                        : urgency === "amber"
                        ? "text-amber-600"
                        : "text-green-600"
                    }`}
                  >
                    {leaveCountdownText}
                  </span>
                </p>
                {nextEvent.leave_by_note && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {nextEvent.leave_by_note}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Full event card */}
          <EventCard event={nextEvent} />
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
    </div>
  );
}
