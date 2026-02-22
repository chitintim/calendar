import type { UrgencyStatus } from "@/lib/types";

// StatusBadge only renders for non-null statuses
type ActiveStatus = Exclude<UrgencyStatus, null>;

interface StatusBadgeProps {
  status: ActiveStatus;
  size?: "sm" | "md";
}

const statusConfig: Record<
  ActiveStatus,
  { bg: string; ring: string; dot: string; label: string }
> = {
  green: {
    bg: "bg-green-50",
    ring: "ring-green-200",
    dot: "bg-green-500",
    label: "On track",
  },
  amber: {
    bg: "bg-amber-50",
    ring: "ring-amber-200",
    dot: "bg-amber-500",
    label: "Get ready",
  },
  red: {
    bg: "bg-red-50",
    ring: "ring-red-200",
    dot: "bg-red-500",
    label: "Go now!",
  },
  past: {
    bg: "bg-gray-50",
    ring: "ring-gray-200",
    dot: "bg-gray-400",
    label: "Past",
  },
};

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = statusConfig[status];

  if (size === "sm") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${config.bg} ${config.ring}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ring-1 ring-inset ${config.bg} ${config.ring}`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot} animate-pulse`} />
      {config.label}
    </span>
  );
}
