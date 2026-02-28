/**
 * /api/agent/chat — POST
 * ----------------------
 * Streaming chat endpoint for the Guru AI agent.
 *
 * 1. Validates { messages, conversationId? } from the request body
 * 2. Creates a new conversation if none supplied
 * 3. Builds the dynamic system prompt (with live context)
 * 4. Loads conversation history from PostgreSQL
 * 5. Calls streamText() with Anthropic Claude + agent tools
 * 6. Persists the full turn (user + assistant + tool messages) on finish
 * 7. Returns a streaming data response
 */

import { z } from "zod/v4";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

import { auth, type SessionWithAccessToken } from "@/lib/auth";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { agentToolsForVercelAI } from "@/lib/agent/tools";
import {
  createConversation,
  loadHistory,
  appendMessages,
  updateTitle,
} from "@/lib/agent/conversation-store";

// Allow up to 60 s on Vercel Pro
export const maxDuration = 60;

// ─── Request validation ─────────────────────────────────────────

const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system", "tool"]),
      content: z.unknown(),
    })
  ),
  conversationId: z.string().optional(),
});

// ─── POST handler ───────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    // ── Auth ──────────────────────────────────────────────────
    const session = (await auth()) as SessionWithAccessToken | null;
    if (!session?.user?.id) {
      return Response.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    // ── Parse & validate body ────────────────────────────────
    const body = await req.json();
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { messages: incomingMessages, conversationId: existingConvId } =
      parsed.data;

    // ── Conversation ─────────────────────────────────────────
    let conversationId = existingConvId;
    let isNewConversation = false;

    if (!conversationId) {
      // Derive initial title from the first user message
      const firstUserMsg = incomingMessages.find((m) => m.role === "user");
      const initialTitle =
        typeof firstUserMsg?.content === "string"
          ? firstUserMsg.content.slice(0, 100)
          : "New conversation";

      conversationId = await createConversation(userId, initialTitle);
      isNewConversation = true;
    }

    // ── System prompt (with live context) ────────────────────
    const systemPrompt = await buildSystemPrompt();

    // ── Load conversation history ────────────────────────────
    const history: ModelMessage[] = isNewConversation
      ? []
      : await loadHistory(conversationId, userId);

    // ── Merge history + incoming messages ─────────────────────
    const newMessages = incomingMessages.map((m) => ({
      role: m.role as ModelMessage["role"],
      content: m.content as ModelMessage["content"],
    })) as ModelMessage[];

    const allMessages: ModelMessage[] = [...history, ...newMessages];

    // ── Persist incoming user messages ────────────────────────
    const userMessages = newMessages.filter((m) => m.role === "user");
    if (userMessages.length > 0) {
      await appendMessages(conversationId, userMessages);
    }

    // ── Stream with Claude ───────────────────────────────────
    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: allMessages,
      tools: agentToolsForVercelAI,
      stopWhen: stepCountIs(10),
      onFinish: async ({ response }) => {
        try {
          // Persist all assistant + tool messages from this turn
          const responseMessages = response.messages as ModelMessage[];
          if (responseMessages.length > 0) {
            await appendMessages(conversationId!, responseMessages);
          }

          // Update title if this was the first message
          if (isNewConversation && userMessages.length > 0) {
            const firstContent = userMessages[0]?.content;
            if (typeof firstContent === "string" && firstContent.length > 0) {
              await updateTitle(
                conversationId!,
                firstContent.slice(0, 100)
              );
            }
          }
        } catch (err) {
          console.error("[agent/chat] Failed to persist messages:", err);
        }
      },
    });

    // ── Return streaming UI message response with conversationId header ─
    const response = result.toUIMessageStreamResponse();

    // Attach conversationId so the client knows which conversation this is
    response.headers.set("X-Conversation-Id", conversationId);

    return response;
  } catch (err) {
    console.error("[agent/chat] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
