"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Command } from "cmdk";
import {
  Mail,
  CalendarDays,
  Play,
  Settings,
  Sparkles,
  MessageSquare,
  Search,
} from "lucide-react";
import { useAgentContext } from "@/components/agent/AgentContext";

// ─── Types ──────────────────────────────────────────────────────

interface ConversationItem {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

interface CommandPaletteProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

// ─── Component ──────────────────────────────────────────────────

export function CommandPalette({ isOpen, setIsOpen }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const { open: openAgent, setConversationId } = useAgentContext();

  // Load recent conversations when palette opens
  useEffect(() => {
    if (!isOpen) return;
    setSearch("");
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/agent/history?limit=5");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setConversations(data.conversations ?? []);
        }
      } catch {
        // ignore — conversations section just won't show
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // ── Handlers ───────────────────────────────────────────────────

  const close = useCallback(() => setIsOpen(false), [setIsOpen]);

  const askGuru = useCallback(
    (text: string) => {
      close();
      setConversationId(null); // new conversation
      openAgent();
      // Dispatch a custom event that AgentPanel can pick up to auto-send
      window.dispatchEvent(
        new CustomEvent("guru:send", { detail: { text } })
      );
    },
    [close, openAgent, setConversationId]
  );

  const openConversation = useCallback(
    (id: string) => {
      close();
      setConversationId(id);
      openAgent();
    },
    [close, openAgent, setConversationId]
  );

  const handlePlayPause = useCallback(async () => {
    close();
    try {
      await fetch("/api/spotify/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "play" }),
      });
    } catch {
      // ignore
    }
  }, [close]);

  const scrollToPanel = useCallback(
    (panelType: string) => {
      close();
      // Try to find the panel element in the dashboard grid
      const el = document.querySelector(`[data-panel-type="${panelType}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [close]
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in-0"
        onClick={close}
        aria-hidden
      />

      {/* Palette */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
        <Command
          className="w-full max-w-xl rounded-xl border border-border bg-popover shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
          shouldFilter={true}
          loop
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Escape") close();
          }}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Type a command or ask Guru…"
              className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Results list */}
          <Command.List className="max-h-[320px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* ── Quick Actions ────────────────────────────── */}
            <Command.Group
              heading="Quick Actions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              <Command.Item
                value="Open Gmail"
                onSelect={() => scrollToPanel("gmail")}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              >
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>Open Gmail</span>
              </Command.Item>

              <Command.Item
                value="Open Calendar"
                onSelect={() => scrollToPanel("calendar")}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              >
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span>Open Calendar</span>
              </Command.Item>

              <Command.Item
                value="Play Pause Spotify Music"
                onSelect={handlePlayPause}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              >
                <Play className="h-4 w-4 text-muted-foreground" />
                <span>Play / Pause Spotify</span>
              </Command.Item>

              <Command.Item
                value="Open Settings"
                onSelect={() => {
                  close();
                  window.location.href = "/settings";
                }}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span>Open Settings</span>
              </Command.Item>
            </Command.Group>

            {/* ── Ask Guru ─────────────────────────────────── */}
            {search.trim().length > 0 && (
              <Command.Group
                heading="Ask Guru"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                <Command.Item
                  value={`Ask Guru ${search}`}
                  onSelect={() => askGuru(search.trim())}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <span>
                    Ask Guru:{" "}
                    <span className="font-medium text-foreground">
                      {search.trim().length > 60
                        ? search.trim().slice(0, 60) + "…"
                        : search.trim()}
                    </span>
                  </span>
                </Command.Item>
              </Command.Group>
            )}

            {/* ── Recent Conversations ─────────────────────── */}
            {conversations.length > 0 && (
              <Command.Group
                heading="Recent Conversations"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {conversations.map((conv) => (
                  <Command.Item
                    key={conv.id}
                    value={`conversation ${conv.title}`}
                    onSelect={() => openConversation(conv.id)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  >
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <span className="truncate block">
                        {conv.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {conv.messageCount} messages
                      </span>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer hint */}
          <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span>
              <kbd className="rounded border border-border bg-muted px-1 font-mono">↑↓</kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1 font-mono">↵</kbd>{" "}
              Select
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1 font-mono">Esc</kbd>{" "}
              Close
            </span>
          </div>
        </Command>
      </div>
    </>
  );
}
