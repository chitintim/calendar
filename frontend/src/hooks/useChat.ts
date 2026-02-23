import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import type { ChatMessage } from "@/lib/types";

export function useChat(groupId: string | null, userId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data, error: fetchErr } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setMessages((data ?? []) as ChatMessage[]);
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to Realtime for new messages (from other users and AI inserts)
  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`chat:${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            // Deduplicate — may already have been added by the sender
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Replace local placeholder AI message with the real DB row
            const localPlaceholderIdx = newMsg.role === "assistant"
              ? prev.findIndex((m) => m.id.startsWith("local-ai-") && m.content === newMsg.content)
              : -1;
            if (localPlaceholderIdx >= 0) {
              const updated = [...prev];
              updated[localPlaceholderIdx] = newMsg;
              return updated;
            }
            return [...prev, newMsg];
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  // Send a message and stream the AI response
  const sendMessage = useCallback(
    async (content: string) => {
      if (!groupId || !userId || !content.trim()) return;

      setSending(true);
      setError(null);

      // 1. Insert user message directly (appears instantly via Realtime)
      const { data: inserted, error: insertErr } = await supabase
        .from("chat_messages")
        .insert({
          group_id: groupId,
          user_id: userId,
          role: "user" as const,
          content: content.trim(),
        })
        .select()
        .single();

      if (insertErr) {
        setError(insertErr.message);
        setSending(false);
        return;
      }

      // Add to local state immediately (Realtime will deduplicate)
      if (inserted) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === (inserted as ChatMessage).id))
            return prev;
          return [...prev, inserted as ChatMessage];
        });
      }

      // 2. Call edge function and read SSE stream
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const resp = await fetch(
          `${supabaseUrl}/functions/v1/chat-respond`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token}`,
              apikey: supabaseAnonKey,
            },
            body: JSON.stringify({ group_id: groupId }),
          },
        );

        if (!resp.ok) {
          const errData = await resp
            .json()
            .catch(() => ({ error: "Unknown error" }));
          setError(errData.error ?? `Failed (${resp.status})`);
          setSending(false);
          return;
        }

        // Read SSE stream
        const reader = resp.body?.getReader();
        if (!reader) {
          setError("No response stream");
          setSending(false);
          return;
        }

        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";

        setStreamingContent("");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();

            try {
              const parsed = JSON.parse(data);

              if (parsed.text) {
                accumulated += parsed.text;
                setStreamingContent(accumulated);
              }

              if (parsed.done && accumulated.trim()) {
                // Add AI message to local state immediately so it doesn't
                // disappear between stream end and Realtime delivery.
                // Realtime INSERT will deduplicate via the id check.
                const localAiMsg: ChatMessage = {
                  id: `local-ai-${Date.now()}`,
                  group_id: groupId!,
                  user_id: null,
                  role: "assistant",
                  content: accumulated.trim(),
                  metadata: {},
                  created_at: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, localAiMsg]);
              }
            } catch {
              // Skip unparseable
            }
          }
        }

        // Clear streaming state — the complete message will appear via Realtime
        setStreamingContent(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to get AI response",
        );
        setStreamingContent(null);
      }

      setSending(false);
    },
    [groupId, userId],
  );

  // Clear all messages for this group
  const clearChat = useCallback(async () => {
    if (!groupId) return;

    const { error: deleteErr } = await supabase
      .from("chat_messages")
      .delete()
      .eq("group_id", groupId);

    if (deleteErr) {
      setError(deleteErr.message);
    } else {
      setMessages([]);
    }
  }, [groupId]);

  return {
    messages,
    loading,
    sending,
    streamingContent,
    error,
    sendMessage,
    clearChat,
    clearError: () => setError(null),
  };
}
