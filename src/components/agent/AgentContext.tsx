"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

// ─── Types ──────────────────────────────────────────────────────

interface AgentState {
  /** Current conversation ID (null = no conversation yet) */
  conversationId: string | null;
  /** Whether the agent panel is visible */
  isOpen: boolean;
  /** Docked (right rail) vs floating (draggable window) */
  isDocked: boolean;
}

interface AgentContextValue extends AgentState {
  setConversationId: (id: string | null) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  toggleDock: () => void;
}

// ─── Context ────────────────────────────────────────────────────

const AgentContext = createContext<AgentContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────

export function AgentProvider({ children }: { children: ReactNode }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDocked, setIsDocked] = useState(true);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const toggleDock = useCallback(() => setIsDocked((v) => !v), []);

  return (
    <AgentContext.Provider
      value={{
        conversationId,
        setConversationId,
        isOpen,
        isDocked,
        open,
        close,
        toggle,
        toggleDock,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────

export function useAgentContext(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    throw new Error("useAgentContext must be used within <AgentProvider>");
  }
  return ctx;
}
