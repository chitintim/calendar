import { useState } from "react";
import { useGroups } from "@/hooks/useGroups";

interface GroupsProps {
  userId: string;
}

export function Groups({ userId }: GroupsProps) {
  const {
    groups,
    loading,
    error,
    createGroup,
    generateInviteCode,
    joinGroup,
    leaveGroup,
  } = useGroups(userId);

  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    const result = await joinGroup(joinCode.trim());
    if (result.error) {
      setJoinError(result.error);
    } else {
      setJoinCode("");
    }
    setJoining(false);
  };

  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    setCreating(true);
    const result = await createGroup(newGroupName.trim());
    if (result.error) {
      setJoinError(result.error);
    } else {
      setNewGroupName("");
      setShowCreate(false);
    }
    setCreating(false);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Groups</h1>

      {/* Join a group */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Join a Group
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Enter invite code"
            maxLength={8}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono tracking-wider focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          <button
            onClick={handleJoin}
            disabled={joining || !joinCode.trim()}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            {joining ? "Joining..." : "Join"}
          </button>
        </div>
        {joinError && (
          <p className="text-red-600 text-sm mt-2">{joinError}</p>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Group list */}
      {groups.map((group) => {
        const isOwner = group.created_by === userId;

        return (
          <div
            key={group.id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
          >
            {/* Group header */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-lg">{"\uD83D\uDC65"}</span>
                <h3 className="font-semibold text-gray-900">{group.name}</h3>
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase">
                {isOwner ? "Owner" : "Member"}
              </span>
            </div>

            {/* Members */}
            <div className="p-5 space-y-3">
              {group.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                    <span className="text-sm font-semibold text-brand-700">
                      {(member.profiles?.display_name ?? "?")[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {member.profiles?.display_name ?? "Unknown"}
                      {member.user_id === userId && (
                        <span className="ml-1.5 text-xs text-brand-600 font-normal">
                          You
                        </span>
                      )}
                    </p>
                    {member.profiles?.base_city && (
                      <p className="text-xs text-gray-500">
                        {member.profiles.base_city}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{member.role}</span>
                </div>
              ))}
            </div>

            {/* Invite code section (owner only) */}
            {isOwner && (
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 space-y-2">
                {group.invite_code ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Invite code:</span>
                    <code className="text-sm font-mono font-semibold text-gray-800 bg-white px-2 py-0.5 rounded border border-gray-200">
                      {group.invite_code}
                    </code>
                    <button
                      onClick={() => handleCopyCode(group.invite_code!)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      {copiedCode === group.invite_code
                        ? "\u2705 Copied"
                        : "\uD83D\uDCCB Copy"}
                    </button>
                  </div>
                ) : null}
                <button
                  onClick={() => generateInviteCode(group.id)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  {group.invite_code
                    ? "Generate New Code"
                    : "Generate Invite Code"}
                </button>
              </div>
            )}

            {/* Leave group (non-owners) */}
            {!isOwner && (
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                <button
                  onClick={() => leaveGroup(group.id)}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  Leave Group
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {groups.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <span className="text-3xl">{"\uD83D\uDC65"}</span>
          <p className="text-gray-500 mt-2">
            No groups yet. Create one or join with an invite code.
          </p>
        </div>
      )}

      {/* Create new group */}
      {showCreate ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Create New Group
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newGroupName.trim()}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40 transition-colors"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewGroupName("");
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full py-3 text-sm font-medium text-brand-600 bg-brand-50 rounded-xl hover:bg-brand-100 transition-colors border border-brand-200"
        >
          + Create New Group
        </button>
      )}
    </div>
  );
}
