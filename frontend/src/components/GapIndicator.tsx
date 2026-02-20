import type { GapPeriod } from "@/lib/togetherTimes";

interface GapIndicatorProps {
  gap: GapPeriod;
}

export function GapIndicator({ gap }: GapIndicatorProps) {
  const durationStr = formatGapDuration(gap.durationHours);
  const locationStr = gap.lastCity
    ? `${gap.lastCity}${gap.isAtHome ? " (home)" : ""}`
    : null;

  return (
    <div
      className={`my-2 flex items-center justify-center gap-2 py-1.5 text-xs ${
        gap.isAtHome ? "text-gray-400" : "text-amber-500"
      }`}
    >
      <span className="flex-1 border-t border-dashed border-gray-200" />
      <span>
        {durationStr}
        {locationStr && <span className="ml-1">&middot; {locationStr}</span>}
      </span>
      <span className="flex-1 border-t border-dashed border-gray-200" />
    </div>
  );
}

function formatGapDuration(hours: number): string {
  if (hours < 24) {
    return `${Math.round(hours)}h gap`;
  }
  const days = Math.floor(hours / 24);
  const remaining = Math.round(hours % 24);
  if (remaining === 0) {
    return `${days} day${days > 1 ? "s" : ""} gap`;
  }
  return `${days}d ${remaining}h gap`;
}
