import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useChat } from "@/hooks/useChat";
import { useGroups } from "@/hooks/useGroups";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/Avatar";
import type { ChatMessage, Profile } from "@/lib/types";

interface ChatProps {
  userId: string;
}

// Quick-action suggestion chips for empty state
const SUGGESTIONS = [
  "When are we next together?",
  "What's the plan for our next trip?",
  "Any tight connections in our itinerary?",
  "Restaurant ideas?",
];

export function Chat({ userId }: ChatProps) {
  const { groups, loading: groupsLoading } = useGroups(userId);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [input, setInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-select group
  useEffect(() => {
    if (groups.length === 1 && !selectedGroupId) {
      setSelectedGroupId(groups[0]!.id);
    }
  }, [groups, selectedGroupId]);

  const {
    messages,
    loading: chatLoading,
    sending,
    streamingContent,
    error,
    sendMessage,
    clearChat,
    clearError,
  } = useChat(selectedGroupId, userId);

  const handleClearChat = useCallback(async () => {
    await clearChat();
    setShowClearConfirm(false);
  }, [clearChat]);

  // Fetch profiles for the selected group
  useEffect(() => {
    if (!selectedGroupId) return;

    async function fetchProfiles() {
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", selectedGroupId!);

      if (!members?.length) return;

      const memberIds = members.map((m) => m.user_id);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", memberIds);

      const map = new Map<string, Profile>();
      for (const p of profileData ?? []) {
        map.set(p.id, p as Profile);
      }
      setProfiles(map);
    }

    fetchProfiles();
  }, [selectedGroupId]);

  // Auto-scroll to bottom on new messages or streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!input.trim() || sending) return;
      const content = input;
      setInput("");
      sendMessage(content);
      // Re-focus input after send
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [input, sending, sendMessage],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      if (sending) return;
      sendMessage(suggestion);
    },
    [sending, sendMessage],
  );

  // Loading state
  if (groupsLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading...
      </div>
    );
  }

  // No groups
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <p className="text-gray-500 mb-2">
          Join or create a group to start chatting.
        </p>
        <a
          href="#/groups"
          className="text-brand-600 font-medium hover:underline"
        >
          Go to Groups
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col -mx-4 -mt-4 md:-mt-6" style={{ height: "calc(100vh - 3rem - 3.5rem)" }}>
      {/* Group picker (only if multiple groups) */}
      {groups.length > 1 && (
        <div className="px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
          <select
            value={selectedGroupId ?? ""}
            onChange={(e) => setSelectedGroupId(e.target.value || null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Select a group...</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Chat header with clear button */}
      {selectedGroupId && messages.length > 0 && !chatLoading && (
        <div className="px-4 py-1.5 border-b border-gray-100 bg-white flex-shrink-0 flex justify-end">
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={sending}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            Clear chat
          </button>
        </div>
      )}

      {/* Clear confirmation dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl shadow-lg max-w-xs w-full p-5 text-center">
            <p className="text-sm font-semibold text-gray-800 mb-1">
              Clear conversation?
            </p>
            <p className="text-xs text-gray-500 mb-4">
              This will delete all messages in this chat for everyone in the group. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearChat}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm text-white font-medium hover:bg-red-700 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!selectedGroupId && (
          <div className="text-center text-gray-400 mt-8">
            Select a group to start chatting
          </div>
        )}

        {selectedGroupId && chatLoading && (
          <div className="text-center text-gray-400 mt-8">
            Loading messages...
          </div>
        )}

        {selectedGroupId && !chatLoading && messages.length === 0 && !streamingContent && (
          <EmptyState
            suggestions={SUGGESTIONS}
            onSuggestionClick={handleSuggestionClick}
            disabled={sending}
          />
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            currentUserId={userId}
            profiles={profiles}
          />
        ))}

        {/* Streaming AI response */}
        {streamingContent !== null && (
          <div className="flex gap-2 items-start">
            <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm">
              AI
            </span>
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-gray-100 text-gray-800 text-sm prose prose-sm prose-gray max-w-none">
              {streamingContent ? (
                <>
                  <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
                </>
              ) : (
                <span className="inline-flex gap-1 text-gray-400">
                  <span className="animate-pulse">Thinking</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.3s" }}>.</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mx-auto max-w-sm bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm text-center">
            {error}
            <button
              onClick={clearError}
              className="ml-2 underline text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      {selectedGroupId && (
        <form
          onSubmit={handleSend}
          className="flex-shrink-0 px-4 py-3 border-t border-gray-200 bg-white pb-16 md:pb-3"
        >
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your trip..."
              className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-brand-700 transition-colors"
            >
              {sending ? "..." : "Send"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// --- Sub-components ---

function EmptyState({
  suggestions,
  onSuggestionClick,
  disabled,
}: {
  suggestions: string[];
  onSuggestionClick: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
      <div className="text-3xl mb-3">AI</div>
      <h3 className="text-lg font-semibold text-gray-800 mb-1">
        Trip Assistant
      </h3>
      <p className="text-sm text-gray-500 mb-6 max-w-xs">
        Ask me anything about your trips — logistics, suggestions, timings, or
        just chat with your group.
      </p>
      <div className="flex flex-wrap gap-2 justify-center max-w-sm">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestionClick(s)}
            disabled={disabled}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  currentUserId,
  profiles,
}: {
  message: ChatMessage;
  currentUserId: string;
  profiles: Map<string, Profile>;
}) {
  const isMe = message.user_id === currentUserId;
  const isAi = message.role === "assistant";
  const profile = message.user_id ? profiles.get(message.user_id) : null;

  if (isAi) {
    return (
      <div className="flex gap-2 items-start">
        <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-500">
          AI
        </span>
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-gray-100 text-gray-800 text-sm prose prose-sm prose-gray max-w-none">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  if (isMe) {
    return (
      <div className="flex gap-2 items-start justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 bg-brand-600 text-white text-sm whitespace-pre-wrap">
          {message.content}
        </div>
        {profile ? (
          <Avatar
            avatarUrl={profile.avatar_url}
            displayName={profile.display_name}
            size="sm"
            colorScheme="brand"
          />
        ) : (
          <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
            ?
          </span>
        )}
      </div>
    );
  }

  // Other user's message
  return (
    <div className="flex gap-2 items-start">
      {profile ? (
        <Avatar
          avatarUrl={profile.avatar_url}
          displayName={profile.display_name}
          size="sm"
          colorScheme="blue"
        />
      ) : (
        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
          ?
        </span>
      )}
      <div>
        {profile && (
          <div className="text-[11px] text-gray-500 mb-0.5 ml-1">
            {profile.display_name}
          </div>
        )}
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-blue-50 text-gray-800 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
}
