/**
 * conversation-store.ts
 * ---------------------
 * CRUD helpers for agent conversations persisted in PostgreSQL via Prisma.
 * Each conversation belongs to a user and contains an ordered list of
 * messages (user, assistant, tool).
 */

import { prisma } from "@/lib/db";
import type { ModelMessage } from "ai";
import type { Prisma } from "@prisma/client";

// ─── Types ──────────────────────────────────────────────────────

/** Anthropic API message format for conversation history. */
export interface AnthropicMessage {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: unknown }
        | { type: "tool_result"; tool_use_id: string; content: string }
      >;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  lastMessagePreview: string | null;
}

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  toolCalls: unknown | null;
  toolResults: unknown | null;
  createdAt: Date;
}

// ─── Create ─────────────────────────────────────────────────────

export async function createConversation(
  userId: string,
  title?: string
): Promise<string> {
  const conv = await prisma.conversation.create({
    data: {
      userId,
      title: title || "New conversation",
    },
  });
  return conv.id;
}

// ─── Read ───────────────────────────────────────────────────────

export async function listConversations(
  userId: string,
  limit = 50
): Promise<ConversationSummary[]> {
  const conversations = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      _count: {
        select: { messages: true },
      },
    },
  });

  // Fetch last message for preview in a single query per conversation
  // We already have the conversations; grab last messages in bulk
  const conversationIds = conversations.map((c) => c.id);
  const lastMessages =
    conversationIds.length > 0
      ? await prisma.$queryRawUnsafe<
          { conversationId: string; content: string; role: string }[]
        >(
          `SELECT DISTINCT ON ("conversationId") "conversationId", "content", "role"
           FROM "ConversationMessage"
           WHERE "conversationId" = ANY($1::text[])
           ORDER BY "conversationId", "createdAt" DESC`,
          conversationIds
        )
      : [];

  const previewMap = new Map<string, string>();
  for (const msg of lastMessages) {
    const preview =
      msg.content.length > 120
        ? msg.content.slice(0, 120) + "…"
        : msg.content;
    previewMap.set(msg.conversationId, preview);
  }

  return conversations.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c._count.messages,
    lastMessagePreview: previewMap.get(c.id) ?? null,
  }));
}

export async function getConversation(
  conversationId: string,
  userId: string
): Promise<{ id: string; title: string; messages: StoredMessage[] } | null> {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conv) return null;

  return {
    id: conv.id,
    title: conv.title,
    messages: conv.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      toolResults: m.toolResults,
      createdAt: m.createdAt,
    })),
  };
}

/**
 * Load conversation messages formatted as ModelMessage[] for the AI SDK.
 */
export async function loadHistory(
  conversationId: string,
  userId: string
): Promise<ModelMessage[]> {
  const conv = await getConversation(conversationId, userId);
  if (!conv) return [];

  return conv.messages
    .map((m) => storedToModelMessage(m))
    .filter((m): m is ModelMessage => m !== null);
}

/**
 * Load the last N messages from a conversation, formatted as
 * Anthropic API-compatible messages array.
 *
 * Messages are returned in chronological order (oldest first).
 * Tool messages are collapsed into adjacent assistant/user turns
 * so the result is a clean user/assistant alternation.
 */
export async function loadConversationHistory(
  conversationId: string,
  maxMessages = 50
): Promise<AnthropicMessage[]> {
  const rows = await prisma.conversationMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: maxMessages,
    select: {
      role: true,
      content: true,
      toolCalls: true,
      toolResults: true,
    },
  });

  // Reverse so oldest is first
  rows.reverse();

  const messages: AnthropicMessage[] = [];

  for (const row of rows) {
    if (row.role === "user") {
      messages.push({ role: "user", content: row.content });
    } else if (row.role === "assistant") {
      // If tool calls were stored, reconstruct content blocks
      if (row.toolCalls && Array.isArray(row.toolCalls)) {
        const parts: AnthropicMessage["content"] = [];
        // Add text content if present and not just serialised blocks
        if (row.content && !row.content.startsWith("[")) {
          parts.push({ type: "text" as const, text: row.content });
        }
        for (const tc of row.toolCalls as Array<{
          toolCallId?: string;
          toolName?: string;
          args?: unknown;
        }>) {
          parts.push({
            type: "tool_use" as const,
            id: tc.toolCallId ?? "",
            name: tc.toolName ?? "",
            input: tc.args ?? {},
          });
        }
        if (parts.length > 0) {
          messages.push({ role: "assistant", content: parts });
        } else {
          messages.push({ role: "assistant", content: row.content });
        }
      } else {
        messages.push({ role: "assistant", content: row.content });
      }
    } else if (row.role === "tool") {
      // Anthropic expects tool results inside a user turn
      // Append as a user message with tool_result blocks
      if (row.toolResults && Array.isArray(row.toolResults)) {
        const parts = (row.toolResults as Array<{
          toolCallId?: string;
          result?: unknown;
        }>).map((tr) => ({
          type: "tool_result" as const,
          tool_use_id: tr.toolCallId ?? "",
          content:
            typeof tr.result === "string"
              ? tr.result
              : JSON.stringify(tr.result ?? ""),
        }));
        messages.push({ role: "user", content: parts });
      }
    }
    // Skip system messages — system prompt is injected separately
  }

  return messages;
}

// ─── Write ──────────────────────────────────────────────────────

/**
 * Persist one or more ModelMessages to a conversation.
 */
export async function appendMessages(
  conversationId: string,
  messages: ModelMessage[]
): Promise<void> {
  if (messages.length === 0) return;

  const data = messages.map((m) => modelMessageToRow(conversationId, m));

  await prisma.$transaction([
    prisma.conversationMessage.createMany({ data }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

/**
 * Persist a user message and the assistant's response as AgentMessage records.
 * This is a convenience wrapper over appendMessages that accepts the
 * raw strings and optional tool-call metadata.
 */
export async function persistMessages(
  conversationId: string,
  userMessage: string,
  assistantResponse: {
    text: string;
    toolCalls?: Array<{ id: string; name: string; input: unknown }>;
    tokensUsed?: number;
  }
): Promise<void> {
  const data: Prisma.ConversationMessageCreateManyInput[] = [];

  // 1. User message
  data.push({
    conversationId,
    role: "user",
    content: userMessage,
  });

  // 2. Assistant message
  const toolCallsJson: Prisma.InputJsonValue | undefined =
    assistantResponse.toolCalls && assistantResponse.toolCalls.length > 0
      ? (assistantResponse.toolCalls.map((tc) => ({
          toolCallId: tc.id,
          toolName: tc.name,
          args: tc.input,
        })) as unknown as Prisma.InputJsonValue)
      : undefined;

  data.push({
    conversationId,
    role: "assistant",
    content: assistantResponse.text,
    toolCalls: toolCallsJson,
  });

  await prisma.$transaction([
    prisma.conversationMessage.createMany({ data }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

/**
 * Auto-generate a short conversation title from the first user message.
 * Uses a simple heuristic: takes the first ~50 characters, trims at a
 * word boundary, and appends an ellipsis if truncated.
 */
export function generateTitle(firstMessage: string): string {
  const cleaned = firstMessage
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();

  if (cleaned.length === 0) return "New conversation";
  if (cleaned.length <= 50) return cleaned;

  // Truncate at a word boundary near 50 chars
  const truncated = cleaned.slice(0, 50);
  const lastSpace = truncated.lastIndexOf(" ");
  const title = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
  return title + "…";
}

/**
 * Auto-generate a conversation title from the first user message.
 */
export async function updateTitle(
  conversationId: string,
  title: string
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { title: title.slice(0, 200) },
  });
}

// ─── Delete ─────────────────────────────────────────────────────

export async function deleteConversation(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.conversation.deleteMany({
    where: { id: conversationId, userId },
  });
  return result.count > 0;
}

// ─── Conversion helpers ─────────────────────────────────────────

function modelMessageToRow(
  conversationId: string,
  msg: ModelMessage
): Prisma.ConversationMessageCreateManyInput {
  const role = msg.role;

  // Extract content as a string
  let content = "";
  if (typeof msg.content === "string") {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    // Concatenate text parts for storage
    content = JSON.stringify(msg.content);
  }

  // Extract tool calls from assistant messages
  let toolCalls: Prisma.InputJsonValue | undefined;
  if (role === "assistant" && Array.isArray(msg.content)) {
    const calls = (msg.content as Array<{ type: string }>).filter(
      (p) => p.type === "tool-call"
    );
    if (calls.length > 0) toolCalls = calls as unknown as Prisma.InputJsonValue;
  }

  // Extract tool results from tool messages
  let toolResults: Prisma.InputJsonValue | undefined;
  if (role === "tool" && Array.isArray(msg.content)) {
    toolResults = msg.content as unknown as Prisma.InputJsonValue;
  }

  return {
    conversationId,
    role,
    content,
    toolCalls,
    toolResults,
  };
}

function storedToModelMessage(stored: StoredMessage): ModelMessage | null {
  const { role, content, toolCalls, toolResults } = stored;

  switch (role) {
    case "user":
      return { role: "user", content };

    case "assistant": {
      // If tool calls were stored, reconstruct the full content array
      if (toolCalls && Array.isArray(toolCalls)) {
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            return { role: "assistant", content: parsed };
          }
        } catch {
          // Fall through to plain text
        }
      }
      return { role: "assistant", content };
    }

    case "tool": {
      if (toolResults && Array.isArray(toolResults)) {
        return {
          role: "tool",
          content: toolResults as unknown as ModelMessage & { role: "tool" } extends { content: infer C } ? C : never,
        } as ModelMessage;
      }
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return { role: "tool", content: parsed } as ModelMessage;
        }
      } catch {
        // Can't reconstruct — skip
      }
      return null;
    }

    case "system":
      return { role: "system", content };

    default:
      return null;
  }
}
