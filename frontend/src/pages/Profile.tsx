import { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/lib/supabase";
import type { UserEmail } from "@/lib/types";
import { COUNTRIES, getTimezonesForCountry } from "@/lib/locations";
import { Avatar } from "@/components/Avatar";

/** Center-crop to square and downscale, returns a JPEG Blob wrapped as File. */
async function cropAndResize(file: File, size: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}

interface ProfileProps {
  userId: string;
  onUpdatePassword: (password: string) => Promise<{ error: Error | null }>;
}

interface LayoutContext {
  onSignOut: () => void;
}

export function Profile({ userId, onUpdatePassword }: ProfileProps) {
  const { onSignOut } = useOutletContext<LayoutContext>();
  const { profile, loading, updateProfile, uploadAvatar, removeAvatar } = useProfile(userId);
  const [emails, setEmails] = useState<UserEmail[]>([]);

  const [displayName, setDisplayName] = useState("");
  const [baseCity, setBaseCity] = useState("");
  const [baseTimezone, setBaseTimezone] = useState("");
  const [baseCountry, setBaseCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Avatar upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // Derived: timezones for the selected country
  const availableTimezones = baseCountry
    ? getTimezonesForCountry(baseCountry)
    : [];

  // Load profile into form
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBaseCity(profile.base_city ?? "");
      setBaseTimezone(profile.base_timezone ?? "");
      setBaseCountry(profile.base_country ?? "");
    }
  }, [profile]);

  // Load user emails
  useEffect(() => {
    async function loadEmails() {
      const { data } = await supabase
        .from("user_emails")
        .select("*")
        .eq("user_id", userId)
        .order("is_primary", { ascending: false });
      if (data) setEmails(data as UserEmail[]);
    }
    loadEmails();
  }, [userId]);

  const handleCountryChange = (code: string) => {
    setBaseCountry(code);
    // Auto-select first timezone for the country
    const tzs = getTimezonesForCountry(code);
    if (tzs.length === 1 && tzs[0]) {
      setBaseTimezone(tzs[0].value);
    } else {
      setBaseTimezone("");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp", "image/heic"].includes(file.type)) {
      setAvatarMessage("Please select a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAvatarMessage("Image must be under 10MB");
      return;
    }

    setUploadingAvatar(true);
    setAvatarMessage(null);

    try {
      const resized = await cropAndResize(file, 256);
      setAvatarPreview(URL.createObjectURL(resized));

      const { error } = await uploadAvatar(resized);
      if (error) {
        setAvatarMessage(`Upload failed: ${error.message}`);
        setAvatarPreview(null);
      } else {
        setAvatarMessage("Photo updated!");
        setAvatarPreview(null);
        setTimeout(() => setAvatarMessage(null), 3000);
      }
    } catch {
      setAvatarMessage("Failed to process image");
      setAvatarPreview(null);
    }

    setUploadingAvatar(false);
    e.target.value = "";
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    setAvatarMessage(null);
    const { error } = await removeAvatar();
    setUploadingAvatar(false);
    if (error) {
      setAvatarMessage(`Remove failed: ${error.message}`);
    } else {
      setAvatarMessage("Photo removed");
      setTimeout(() => setAvatarMessage(null), 3000);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);

    const { error } = await updateProfile({
      display_name: displayName || undefined,
      base_city: baseCity || null,
      base_timezone: baseTimezone || null,
      base_country: baseCountry || null,
    });

    if (error) {
      setSaveMessage(`Error: ${error.message}`);
    } else {
      setSaveMessage("Profile saved!");
    }
    setSaving(false);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage("Password must be at least 6 characters");
      return;
    }

    setChangingPassword(true);
    const { error } = await onUpdatePassword(newPassword);

    if (error) {
      setPasswordMessage(`Error: ${error.message}`);
    } else {
      setPasswordMessage("Password updated!");
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPassword(false);
    setTimeout(() => setPasswordMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  const selectClasses =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white";
  const inputClasses =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none";

  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      {/* Profile details */}
      <form onSubmit={handleSaveProfile} className="space-y-4">
        {/* Avatar upload */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="relative group flex-shrink-0"
          >
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Preview"
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <Avatar
                avatarUrl={profile?.avatar_url}
                displayName={displayName || "?"}
                size="lg"
              />
            )}
            <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <span className="text-white text-xs font-medium">
                {uploadingAvatar ? "..." : "Change"}
              </span>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
            >
              {uploadingAvatar ? "Uploading..." : "Change photo"}
            </button>
            {profile?.avatar_url && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={uploadingAvatar}
                className="block text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
              >
                Remove photo
              </button>
            )}
            {avatarMessage && (
              <p
                className={`text-xs ${
                  avatarMessage.includes("failed") || avatarMessage.includes("Please") || avatarMessage.includes("must")
                    ? "text-red-600"
                    : "text-green-600"
                }`}
              >
                {avatarMessage}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Display name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClasses}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Country
          </label>
          <select
            value={baseCountry}
            onChange={(e) => handleCountryChange(e.target.value)}
            className={selectClasses}
          >
            <option value="">Select country...</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timezone
          </label>
          {availableTimezones.length > 1 ? (
            <select
              value={baseTimezone}
              onChange={(e) => setBaseTimezone(e.target.value)}
              className={selectClasses}
            >
              <option value="">Select timezone...</option>
              {availableTimezones.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={
                availableTimezones.length === 1 && availableTimezones[0]
                  ? availableTimezones[0].label
                  : baseTimezone || "Select a country first"
              }
              disabled
              className={`${inputClasses} bg-gray-50 text-gray-500`}
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Base city
          </label>
          <input
            type="text"
            value={baseCity}
            onChange={(e) => setBaseCity(e.target.value)}
            placeholder="e.g. Hong Kong"
            className={inputClasses}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
          {saveMessage && (
            <span
              className={`text-sm ${
                saveMessage.startsWith("Error")
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {saveMessage}
            </span>
          )}
        </div>
      </form>

      {/* Registered emails */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Registered emails
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Forward booking confirmations from any of these addresses.
        </p>
        <div className="space-y-2">
          {emails.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200"
            >
              <span className="text-sm font-mono text-gray-700">
                {entry.email}
              </span>
              {entry.is_primary && (
                <span className="px-1.5 py-0.5 bg-brand-50 text-brand-700 text-xs rounded font-medium">
                  Primary
                </span>
              )}
            </div>
          ))}
          {emails.length === 0 && (
            <p className="text-sm text-gray-400">No emails registered.</p>
          )}
        </div>
      </div>

      {/* Change password */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Change password
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClasses}
              minLength={6}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClasses}
              minLength={6}
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={changingPassword}
              className="px-4 py-2 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              {changingPassword ? "Updating..." : "Update password"}
            </button>
            {passwordMessage && (
              <span
                className={`text-sm ${
                  passwordMessage.startsWith("Error") ||
                  passwordMessage.includes("do not match") ||
                  passwordMessage.includes("at least")
                    ? "text-red-600"
                    : "text-green-600"
                }`}
              >
                {passwordMessage}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Sign out */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={onSignOut}
          className="w-full py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
