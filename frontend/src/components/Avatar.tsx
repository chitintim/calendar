import { useState } from "react";

interface AvatarProps {
  avatarUrl: string | null | undefined;
  displayName: string;
  size?: "xs" | "sm" | "md" | "lg";
  colorScheme?: "brand" | "blue" | "rose";
  className?: string;
}

const SIZES = {
  xs: "w-8 h-8 text-xs",
  sm: "w-10 h-10 text-sm",
  md: "w-14 h-14 text-base",
  lg: "w-24 h-24 text-3xl",
};

const COLORS = {
  brand: { bg: "bg-brand-100", text: "text-brand-700" },
  blue: { bg: "bg-blue-100", text: "text-blue-700" },
  rose: { bg: "bg-rose-100", text: "text-rose-700" },
};

const SUPABASE_STORAGE_URL =
  "https://wwpmmkudqeqpbtezfupa.supabase.co/storage/v1/object/public/avatars";

export function Avatar({
  avatarUrl,
  displayName,
  size = "md",
  colorScheme = "brand",
  className = "",
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const sizeClasses = SIZES[size];
  const initial = (displayName ?? "?")[0]?.toUpperCase() ?? "?";

  if (avatarUrl && !imgError) {
    const url = `${SUPABASE_STORAGE_URL}/${avatarUrl}`;
    return (
      <img
        src={url}
        alt={displayName}
        loading="lazy"
        onError={() => setImgError(true)}
        className={`${sizeClasses} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  const colors = COLORS[colorScheme];
  return (
    <span
      className={`${sizeClasses} rounded-full ${colors.bg} ${colors.text} flex items-center justify-center font-bold flex-shrink-0 ${className}`}
    >
      {initial}
    </span>
  );
}
