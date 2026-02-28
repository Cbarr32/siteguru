"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  X,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  MessageSquare,
  ChevronDown,
  Loader2,
  AlertCircle,
} from "lucide-react";

import { useAgentContext } from "@/components/agent/AgentContext";
import { useAgent } from "@/hooks/useAgent";
import { AgentMessage } from "@/components/agent/AgentMessage";
import { AgentToolCall } from "@/components/agent/AgentToolCall";
import { AgentInput } from "@/components/agent/AgentInput";

// ─── Types ──────────────────────────────────────────────────────

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

// ─── Conversation Selector ──────────────────────────────────────

function ConversationSelector({
  conversationId,
  onSelect,
}: {
  conversationId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent/history?limit=20");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadConversations();
  }, [open, loadConversations]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = conversations.find((c) => c.id === conversationId);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors max-w-[140px]"
        title="Switch conversation"
      >
        <MessageSquare className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {current?.title || "New chat"}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              No conversations yet
            </p>
          ) : (
            <ScrollArea className="max-h-60">
              <div className="p-1">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      onSelect(conv.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left transition-colors",
                      conv.id === conversationId
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <span className="truncate text-xs font-medium">
                      {conv.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {conv.messageCount} messages
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Welcome Screen ─────────────────────────────────────────────

function WelcomeScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <div>
        <h3 className="text-base font-semibold">Hey! I&apos;m Guru</h3>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-[240px]">
          Your personal AI assistant. I can search your email, manage your
          calendar, play music, check GitHub, and more.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 mt-1">
        {[
          "📧 Search email",
          "📅 Today's events",
          "🎵 Play music",
          "🔔 GitHub alerts",
          "☁️ Weather",
        ].map((label) => (
          <span
            key={label}
            className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Floating Action Button ─────────────────────────────────────

export function AgentFAB() {
  const { isOpen, open } = useAgentContext();

  if (isOpen) return null;

  return (
    <button
      onClick={open}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 transition-all hover:scale-105 hover:shadow-xl hover:shadow-violet-500/40 active:scale-95"
      title="Open Guru"
    >
      <Sparkles className="h-6 w-6" />
    </button>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────

export function AgentPanel() {
  const { isOpen, isDocked, close, toggleDock, conversationId } =
    useAgentContext();
  const {
    messages,
    sendMessage,
    isLoading,
    error,
    clearError,
    switchConversation,
    newConversation,
    stop,
  } = useAgent();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Drag state (floating mode) ─────────────────────────────────
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 400, h: 560 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const isResizing = useRef(false);

  // ── Auto-scroll on new messages ────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Center floating panel on first open ────────────────────────
  useEffect(() => {
    if (!isDocked && isOpen && position.x === 0 && position.y === 0) {
      setPosition({
        x: Math.max(40, window.innerWidth - size.w - 40),
        y: Math.max(40, Math.round((window.innerHeight - size.h) / 2)),
      });
    }
  }, [isDocked, isOpen, position.x, position.y, size.w, size.h]);

  // ── Drag handlers ──────────────────────────────────────────────
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isDocked) return;
      isDragging.current = true;
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };

      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        setPosition({
          x: ev.clientX - dragOffset.current.x,
          y: ev.clientY - dragOffset.current.y,
        });
      };
      const onUp = () => {
        isDragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [isDocked, position]
  );

  // ── Resize handlers ────────────────────────────────────────────
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing.current = true;
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.w;
      const startH = size.h;

      const onMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        setSize({
          w: Math.max(320, startW + (ev.clientX - startX)),
          h: Math.max(400, startH + (ev.clientY - startY)),
        });
      };
      const onUp = () => {
        isResizing.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [size]
  );

  if (!isOpen) return null;

  // ── Render Messages ────────────────────────────────────────────
  const renderMessages = () => {
    if (messages.length === 0) return <WelcomeScreen />;

    return (
      <div className="flex flex-col gap-1 py-3">
        {messages.map((msg) => (
          <React.Fragment key={msg.id}>
            {/* Render tool parts for assistant messages */}
            {msg.role === "assistant" &&
              msg.parts
                .filter(
                  (p) =>
                    p.type.startsWith("tool-") ||
                    p.type === "dynamic-tool"
                )
                .map((toolPart, idx) => (
                  <AgentToolCall
                    key={`${msg.id}-tool-${idx}`}
                    part={toolPart as {
                      toolName: string;
                      toolCallId: string;
                      state: string;
                      input?: unknown;
                      output?: unknown;
                      errorText?: string;
                    }}
                  />
                ))}

            {/* Text content */}
            {msg.parts.some((p) => p.type === "text" && (p as { text: string }).text) && (
              <AgentMessage message={msg} />
            )}
          </React.Fragment>
        ))}

        {/* Streaming indicator */}
        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1]?.role === "user" && (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600">
                <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
              </div>
              <span className="text-xs text-muted-foreground">
                Guru is thinking…
              </span>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>
    );
  };

  // ── Panel Layout ───────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      className={cn(
        "z-40 flex flex-col bg-background border-l border-border shadow-2xl",
        isDocked
          ? "fixed top-0 right-0 h-screen w-[360px]"
          : "fixed rounded-xl border shadow-2xl overflow-hidden"
      )}
      style={
        isDocked
          ? undefined
          : {
              left: position.x,
              top: position.y,
              width: size.w,
              height: size.h,
            }
      }
    >
      {/* ── Header ────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border px-3 py-2 shrink-0",
          !isDocked && "cursor-grab active:cursor-grabbing"
        )}
        onMouseDown={onDragStart}
      >
        {/* Guru branding */}
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold">Guru</span>

        {/* Conversation selector */}
        <ConversationSelector
          conversationId={conversationId}
          onSelect={switchConversation}
        />

        <div className="flex-1" />

        {/* Actions */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={newConversation}
          title="New conversation"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={toggleDock}
          title={isDocked ? "Undock (floating)" : "Dock (right side)"}
        >
          {isDocked ? (
            <PanelRightOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelRightClose className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:text-destructive"
          onClick={close}
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Error banner ──────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-2 shrink-0">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          <span className="text-xs text-destructive flex-1 truncate">
            {error.message}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            onClick={clearError}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* ── Messages ──────────────────────────────────────────── */}
      <ScrollArea className="flex-1 min-h-0">
        {renderMessages()}
      </ScrollArea>

      {/* ── Separator ─────────────────────────────────────────── */}
      <Separator />

      {/* ── Input ─────────────────────────────────────────────── */}
      <div className="shrink-0 p-3">
        <AgentInput onSend={sendMessage} isLoading={isLoading} onStop={stop} />
      </div>

      {/* ── Resize handle (floating mode) ─────────────────────── */}
      {!isDocked && (
        <div
          className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
          onMouseDown={onResizeStart}
        >
          <svg
            className="h-4 w-4 text-muted-foreground/40"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M14 14H12V12H14V14ZM14 10H12V8H14V10ZM10 14H8V12H10V14Z" />
          </svg>
        </div>
      )}
    </div>
  );
}
