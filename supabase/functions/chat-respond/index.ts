import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildGroupContext } from "./context.ts";
import { callAnthropicStream } from "./respond.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT_PER_HOUR = 30;

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    console.error("Missing ANTHROPIC_API_KEY");
    return errorResponse("Server configuration error", 500);
  }

  // --- Auth: verify JWT and get user ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Unauthorized", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // User-scoped client to verify the JWT
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return errorResponse("Unauthorized", 401);
  }

  // Service role client for all DB operations
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  // --- Parse request ---
  let groupId: string;
  try {
    const body = await req.json();
    groupId = body.group_id;
    if (!groupId) throw new Error("missing group_id");
  } catch {
    return errorResponse("group_id is required", 400);
  }

  // --- Verify group membership ---
  const { data: membership } = await serviceClient
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return errorResponse("You are not a member of this group", 403);
  }

  // --- Rate limiting: count AI messages in the last hour ---
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentAiCount } = await serviceClient
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("role", "assistant")
    .gte("created_at", oneHourAgo);

  if ((recentAiCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return errorResponse(
      `Rate limit reached — max ${RATE_LIMIT_PER_HOUR} AI responses per group per hour. Try again later.`,
      429,
    );
  }

  // --- Fetch chat history (last 50 messages) ---
  const { data: recentMessages } = await serviceClient
    .from("chat_messages")
    .select("role, content, user_id, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(50);

  const chatHistory = (recentMessages ?? []).reverse();

  // --- Fetch member profiles for name lookup ---
  const { data: members } = await serviceClient
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);

  const memberIds = (members ?? []).map(
    (m: { user_id: string }) => m.user_id,
  );
  const { data: profiles } = await serviceClient
    .from("profiles")
    .select("id, display_name")
    .in("id", memberIds);

  const profileNames = new Map<string, string>();
  for (const p of profiles ?? []) {
    profileNames.set(
      (p as { id: string; display_name: string }).id,
      (p as { id: string; display_name: string }).display_name,
    );
  }

  // --- Build group context ---
  const groupContext = await buildGroupContext(serviceClient, groupId);

  // --- Helper: read an Anthropic SSE stream and extract content blocks ---
  interface ToolUseBlock {
    id: string;
    name: string;
    input: Record<string, unknown>;
  }

  async function readAnthropicStream(
    response: Response,
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController,
  ): Promise<{ text: string; toolUses: ToolUseBlock[] }> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    const toolUses: ToolUseBlock[] = [];

    // Track current content block for tool_use accumulation
    let currentBlockType: string | null = null;
    let currentToolId = "";
    let currentToolName = "";
    let currentToolInputJson = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);

          // Track block starts
          if (parsed.type === "content_block_start") {
            if (parsed.content_block?.type === "tool_use") {
              currentBlockType = "tool_use";
              currentToolId = parsed.content_block.id ?? "";
              currentToolName = parsed.content_block.name ?? "";
              currentToolInputJson = "";
            } else if (parsed.content_block?.type === "text") {
              currentBlockType = "text";
            }
          }

          // Text deltas — forward to client
          if (
            parsed.type === "content_block_delta" &&
            parsed.delta?.type === "text_delta"
          ) {
            const text = parsed.delta.text;
            fullText += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
            );
          }

          // Tool use input deltas — accumulate JSON
          if (
            parsed.type === "content_block_delta" &&
            parsed.delta?.type === "input_json_delta"
          ) {
            currentToolInputJson += parsed.delta.partial_json ?? "";
          }

          // Block stop — finalize tool use
          if (parsed.type === "content_block_stop" && currentBlockType === "tool_use") {
            try {
              const input = JSON.parse(currentToolInputJson);
              toolUses.push({ id: currentToolId, name: currentToolName, input });
            } catch {
              console.error("Failed to parse tool input:", currentToolInputJson);
            }
            currentBlockType = null;
          }

          if (parsed.type === "error") {
            console.error("Anthropic stream error:", parsed.error);
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    return { text: fullText, toolUses };
  }

  // --- Helper: execute a tool call and return result ---
  async function executeTool(
    tool: ToolUseBlock,
    callerUserId: string,
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController,
  ): Promise<{ tool_use_id: string; content: string }> {
    if (tool.name === "update_event_note") {
      const { event_id, note } = tool.input as { event_id: string; note: string };

      // Verify the event belongs to the calling user (security)
      const { data: event } = await serviceClient
        .from("events")
        .select("id, user_id, title")
        .eq("id", event_id)
        .maybeSingle();

      if (!event) {
        return { tool_use_id: tool.id, content: "Error: Event not found." };
      }
      if (event.user_id !== callerUserId) {
        return {
          tool_use_id: tool.id,
          content: "Error: You can only update notes on your own events.",
        };
      }

      // Update the note
      const { error: updateErr } = await serviceClient
        .from("events")
        .update({ notes: note || null })
        .eq("id", event_id);

      if (updateErr) {
        console.error("Failed to update note:", updateErr);
        return { tool_use_id: tool.id, content: `Error: ${updateErr.message}` };
      }

      // Notify the frontend so it can refresh the event card
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            note_updated: { event_id, note, event_title: event.title },
          })}\n\n`,
        ),
      );

      return {
        tool_use_id: tool.id,
        content: `Successfully saved note on "${event.title}": "${note}"`,
      };
    }

    if (tool.name === "update_trip_note") {
      const { trip_signature, note } = tool.input as { trip_signature: string; note: string };

      if (!trip_signature || !note) {
        return { tool_use_id: tool.id, content: "Error: trip_signature and note are required." };
      }

      // Upsert: check if a note already exists for this trip + group
      const { data: existing } = await serviceClient
        .from("timeline_comments")
        .select("id")
        .eq("group_id", groupId)
        .eq("trip_signature", trip_signature)
        .maybeSingle();

      if (existing) {
        const { error: updateErr } = await serviceClient
          .from("timeline_comments")
          .update({ content: note })
          .eq("id", existing.id);

        if (updateErr) {
          console.error("Failed to update trip note:", updateErr);
          return { tool_use_id: tool.id, content: `Error: ${updateErr.message}` };
        }
      } else {
        const { error: insertErr } = await serviceClient
          .from("timeline_comments")
          .insert({
            group_id: groupId,
            user_id: callerUserId,
            trip_signature,
            content: note,
          });

        if (insertErr) {
          console.error("Failed to insert trip note:", insertErr);
          return { tool_use_id: tool.id, content: `Error: ${insertErr.message}` };
        }
      }

      // Notify the frontend
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            trip_note_updated: { trip_signature, note },
          })}\n\n`,
        ),
      );

      return {
        tool_use_id: tool.id,
        content: `Successfully saved trip note on "${trip_signature}": "${note}"`,
      };
    }

    return { tool_use_id: tool.id, content: "Error: Unknown tool." };
  }

  // --- Call Anthropic with streaming ---
  try {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          // First API call
          const anthropicResponse = await callAnthropicStream(
            anthropicApiKey,
            groupContext,
            chatHistory,
            profileNames,
          );

          const { text: firstText, toolUses } = await readAnthropicStream(
            anthropicResponse,
            encoder,
            controller,
          );

          let fullContent = firstText;

          // If the AI wants to use tools, execute them and make a follow-up call
          if (toolUses.length > 0) {
            // Execute all tool calls
            const toolResults = [];
            for (const tool of toolUses) {
              const result = await executeTool(tool, user.id, encoder, controller);
              toolResults.push(result);
            }

            // Build the assistant content blocks for the multi-turn
            const assistantContent: unknown[] = [];
            if (firstText.trim()) {
              assistantContent.push({ type: "text", text: firstText });
            }
            for (const tool of toolUses) {
              assistantContent.push({
                type: "tool_use",
                id: tool.id,
                name: tool.name,
                input: tool.input,
              });
            }

            // Build tool_result messages
            const toolResultContent = toolResults.map((r) => ({
              type: "tool_result" as const,
              tool_use_id: r.tool_use_id,
              content: r.content,
            }));

            // Second API call with tool results
            const followUpResponse = await callAnthropicStream(
              anthropicApiKey,
              groupContext,
              chatHistory,
              profileNames,
              [
                { role: "assistant", content: assistantContent },
                { role: "user", content: toolResultContent },
              ],
            );

            const { text: secondText } = await readAnthropicStream(
              followUpResponse,
              encoder,
              controller,
            );

            fullContent += secondText;
          }

          // Save the complete AI response to the database
          if (fullContent.trim()) {
            await serviceClient.from("chat_messages").insert({
              group_id: groupId,
              user_id: null,
              role: "assistant",
              content: fullContent.trim(),
            });
          }

          // Signal end of stream
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`),
          );
          controller.close();
        } catch (err) {
          console.error("Stream processing error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Chat respond error:", message);
    return errorResponse(message, 500);
  }
});
