import type { TogetherPeriod } from "@/lib/togetherTimes";
import { useCountdown } from "@/hooks/useCountdown";
import { formatInTimeZone } from "date-fns-tz";

interface TogetherBandProps {
  period: TogetherPeriod;
}

export function TogetherBand({ period }: TogetherBandProps) {
  const isFuture = period.startAt > new Date();
  const countdownText = useCountdown(isFuture ? period.startAt : null);

  const startStr = formatDate(period.startAt);
  const endStr = formatDate(period.endAt);
  const durationStr = formatDuration(period.durationHours);

  return (
    <div className="my-4 rounded-xl bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{"\uD83D\uDC95"}</span>
        <span className="font-semibold text-rose-800 uppercase text-sm tracking-wide">
          Together in {period.city}
        </span>
      </div>

      <p className="text-rose-700 text-sm">
        {startStr} &ndash; {endStr} &middot; {durationStr}
      </p>

      <p className="text-rose-500 text-xs mt-1">
        {period.users.join(" & ")}
      </p>

      {isFuture && countdownText && (
        <p className="text-rose-600 font-medium text-sm mt-2">
          {"\u2764\uFE0F"} In {countdownText}
        </p>
      )}
    </div>
  );
}

function formatDate(date: Date): string {
  return formatInTimeZone(date, "UTC", "EEE d MMM");
}

function formatDuration(hours: number): string {
  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  if (remainingHours === 0) {
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  return `${days}d ${remainingHours}h`;
}
