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

  // --- Call Anthropic with streaming ---
  try {
    const anthropicResponse = await callAnthropicStream(
      anthropicApiKey,
      groupContext,
      chatHistory,
      profileNames,
    );

    // We'll read the Anthropic SSE stream, extract text deltas,
    // forward them as our own SSE stream, and accumulate the full response.
    const reader = anthropicResponse.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE lines
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);

                if (
                  parsed.type === "content_block_delta" &&
                  parsed.delta?.type === "text_delta"
                ) {
                  const text = parsed.delta.text;
                  fullContent += text;
                  // Forward as our own SSE event
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
                  );
                }

                if (parsed.type === "message_stop") {
                  // Stream is done
                }

                if (parsed.type === "error") {
                  console.error("Anthropic stream error:", parsed.error);
                }
              } catch {
                // Skip unparseable lines
              }
            }
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
