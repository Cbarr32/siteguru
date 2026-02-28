"use client";

import { useCallback, useRef, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useAgentContext } from "@/components/agent/AgentContext";

// ─── Types ──────────────────────────────────────────────────────

export interface UseAgentReturn {
  /** All messages in the current conversation */
  messages: UIMessage[];
  /** Send a text message to the agent */
  sendMessage: (text: string) => Promise<void>;
  /** Whether the agent is processing / streaming */
  isLoading: boolean;
  /** Current error, if any */
  error: Error | undefined;
  /** Clear the current error */
  clearError: () => void;
  /** Active conversation ID */
  conversationId: string | null;
  /** Switch to an existing conversation (loads its history) */
  switchConversation: (id: string) => Promise<void>;
  /** Start a fresh conversation */
  newConversation: () => void;
  /** Current status */
  status: "ready" | "submitted" | "streaming" | "error";
  /** Stop the current stream */
  stop: () => void;
}

// ─── Hook ───────────────────────────────────────────────────────

export function useAgent(): UseAgentReturn {
  const {
    conversationId,
    setConversationId,
  } = useAgentContext();

  // Keep a mutable ref so the transport can read the latest conversationId
  const convIdRef = useRef(conversationId);
  convIdRef.current = conversationId;

  // Stable ref for setConversationId to avoid transport recreation
  const setConvIdRef = useRef(setConversationId);
  setConvIdRef.current = setConversationId;

  // Build a DefaultChatTransport that injects conversationId into the
  // request body and captures the response header.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent/chat",
        prepareSendMessagesRequest: ({ messages: uiMessages }) => {
          // Flatten UIMessage parts into the { role, content } shape
          // that /api/agent/chat expects.
          const flatMessages = uiMessages.flatMap((m: UIMessage) =>
            m.parts
              .filter(
                (p): p is { type: "text"; text: string } => p.type === "text"
              )
              .map((p) => ({
                role: m.role,
                content: p.text,
              }))
          );

          return {
            body: {
              messages: flatMessages,
              conversationId: convIdRef.current ?? undefined,
            },
          };
        },
        fetch: async (input, init) => {
          const response = await globalThis.fetch(input, init);

          // Capture conversationId from response header
          const newConvId = response.headers.get("X-Conversation-Id");
          if (newConvId && newConvId !== convIdRef.current) {
            setConvIdRef.current(newConvId);
            convIdRef.current = newConvId;
          }

          return response;
        },
      }),
    [] // stable — reads latest values via refs
  );

  const {
    messages,
    sendMessage: sdkSendMessage,
    status,
    error,
    clearError,
    setMessages,
    stop,
  } = useChat({
    id: conversationId ?? "guru-new",
    transport,
    onError: (err) => {
      console.error("[useAgent] Stream error:", err);
    },
  });

  // ── Send a text message ────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      await sdkSendMessage({ text: text.trim() });
    },
    [sdkSendMessage]
  );

  // ── Switch to an existing conversation ─────────────────────────
  const switchConversation = useCallback(
    async (id: string) => {
      setConversationId(id);
      convIdRef.current = id;

      try {
        const res = await fetch(`/api/agent/history/${id}`);
        if (!res.ok) return;

        const data = await res.json();
        const conv = data.conversation;
        if (!conv?.messages) return;

        // Convert stored messages to UIMessage format
        const uiMsgs: UIMessage[] = conv.messages.map(
          (m: { id: string; role: string; content: string; createdAt: string }) => ({
            id: m.id,
            role: m.role as UIMessage["role"],
            parts: [{ type: "text" as const, text: m.content }],
          })
        );
        setMessages(uiMsgs);
      } catch (err) {
        console.error("[useAgent] Failed to load conversation:", err);
      }
    },
    [setConversationId, setMessages]
  );

  // ── Start a new conversation ───────────────────────────────────
  const newConversation = useCallback(() => {
    setConversationId(null);
    convIdRef.current = null;
    setMessages([]);
  }, [setConversationId, setMessages]);

  const isLoading = status === "submitted" || status === "streaming";

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    clearError,
    conversationId,
    switchConversation,
    newConversation,
    status,
    stop,
  };
}
