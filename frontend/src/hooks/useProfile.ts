import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setProfile(data as Profile);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = useCallback(
    async (updates: Partial<Pick<Profile, "display_name" | "base_city" | "base_timezone" | "base_country" | "preferences">>) => {
      if (!userId) return { error: new Error("No user") };

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          display_name: updates.display_name,
          base_city: updates.base_city,
          base_timezone: updates.base_timezone,
          base_country: updates.base_country,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (!updateError) {
        await fetchProfile();
      }

      return { error: updateError };
    },
    [userId, fetchProfile]
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!userId) return { error: new Error("No user") };

      const path = `${userId}/avatar.jpg`;

      // Upload (upsert) the file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) return { error: uploadError };

      // Save the path with a cache-busting version param.
      // Supabase Storage ignores query params, but the browser sees a new URL
      // and won't serve the old cached image.
      const versionedPath = `${path}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          avatar_url: versionedPath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (!updateError) {
        await fetchProfile();
      }

      return { error: updateError };
    },
    [userId, fetchProfile]
  );

  const removeAvatar = useCallback(
    async () => {
      if (!userId || !profile?.avatar_url) return { error: new Error("No avatar") };

      // Delete from storage — ignore errors since the file may already be gone.
      // Strip any cache-busting query params (e.g., "?v=123") to get the real path.
      const storagePath = profile.avatar_url.split("?")[0]!;
      try {
        await supabase.storage
          .from("avatars")
          .remove([storagePath]);
      } catch {
        // Storage delete can throw TypeError: Failed to fetch on network issues.
        // Continue to clear the profile reference regardless.
      }

      // Clear from profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (!updateError) {
        await fetchProfile();
      }

      return { error: updateError };
    },
    [userId, profile, fetchProfile]
  );

  return { profile, loading, error, updateProfile, uploadAvatar, removeAvatar, refetch: fetchProfile };
}
