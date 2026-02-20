import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Group, GroupMember, Profile } from "@/lib/types";

interface GroupWithMembers extends Group {
  members: (GroupMember & { profiles: Profile })[];
}

export function useGroups(userId: string | undefined) {
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch groups the user belongs to
    const { data: memberRows, error: memberErr } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId);

    if (memberErr) {
      setError(memberErr.message);
      setLoading(false);
      return;
    }

    if (!memberRows || memberRows.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }

    const groupIds = memberRows.map((r) => r.group_id);

    // Fetch group details
    const { data: groupData, error: groupErr } = await supabase
      .from("groups")
      .select("*")
      .in("id", groupIds);

    if (groupErr) {
      setError(groupErr.message);
      setLoading(false);
      return;
    }

    // Fetch all members of these groups
    const { data: allMembers, error: membersErr } = await supabase
      .from("group_members")
      .select("*")
      .in("group_id", groupIds);

    if (membersErr) {
      setError(membersErr.message);
      setLoading(false);
      return;
    }

    // Fetch profiles for all members
    const memberUserIds = [...new Set((allMembers ?? []).map((m) => m.user_id))];
    const profileMap: Record<string, Profile> = {};
    if (memberUserIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", memberUserIds);
      for (const p of profileData ?? []) {
        profileMap[p.id] = p as Profile;
      }
    }

    // Combine
    const result: GroupWithMembers[] = (groupData ?? []).map((g) => ({
      ...g,
      members: (allMembers ?? [])
        .filter((m) => m.group_id === g.id)
        .map((m) => ({
          ...m,
          role: m.role as "owner" | "member",
          profiles: profileMap[m.user_id]!,
        })) as (GroupMember & { profiles: Profile })[],
    }));

    setGroups(result);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const createGroup = useCallback(
    async (name: string) => {
      if (!userId) return { error: "Not authenticated" };

      // Insert group
      const { data: group, error: groupErr } = await supabase
        .from("groups")
        .insert({ name, created_by: userId, max_members: 2 })
        .select("id")
        .single();

      if (groupErr) return { error: groupErr.message };

      // Add self as owner
      const { error: memberErr } = await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: userId, role: "owner" });

      if (memberErr) return { error: memberErr.message };

      await fetchGroups();
      return { groupId: group.id };
    },
    [userId, fetchGroups]
  );

  const generateInviteCode = useCallback(
    async (groupId: string) => {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((b) => b.toString(36).padStart(2, "0"))
        .join("")
        .toUpperCase()
        .slice(0, 8);

      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { error } = await supabase
        .from("groups")
        .update({ invite_code: code, invite_expires_at: expiresAt })
        .eq("id", groupId);

      if (error) return { error: error.message };
      await fetchGroups();
      return { code };
    },
    [fetchGroups]
  );

  const joinGroup = useCallback(
    async (inviteCode: string) => {
      const { error } = await supabase.rpc("join_group_by_invite", {
        p_invite_code: inviteCode,
      });

      if (error) return { error: error.message };
      await fetchGroups();
      return {};
    },
    [fetchGroups]
  );

  const leaveGroup = useCallback(
    async (groupId: string) => {
      if (!userId) return { error: "Not authenticated" };

      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", userId);

      if (error) return { error: error.message };
      await fetchGroups();
      return {};
    },
    [userId, fetchGroups]
  );

  return {
    groups,
    loading,
    error,
    createGroup,
    generateInviteCode,
    joinGroup,
    leaveGroup,
    refetch: fetchGroups,
  };
}
