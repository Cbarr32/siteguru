"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  memo,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Send,
  Mail,
  CalendarDays,
  Play,
  Github,
  Video,
  Cloud,
  Loader2,
  Square,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface AgentInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
}

interface SlashCommand {
  command: string;
  label: string;
  icon: React.ReactNode;
  template: string;
}

// ─── Slash commands ─────────────────────────────────────────────

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/email",
    label: "Search email",
    icon: <Mail className="h-3.5 w-3.5" />,
    template: "Search my email for ",
  },
  {
    command: "/calendar",
    label: "Calendar events",
    icon: <CalendarDays className="h-3.5 w-3.5" />,
    template: "Show my calendar events for ",
  },
  {
    command: "/play",
    label: "Play music",
    icon: <Play className="h-3.5 w-3.5" />,
    template: "Play ",
  },
  {
    command: "/github",
    label: "GitHub",
    icon: <Github className="h-3.5 w-3.5" />,
    template: "Show my GitHub notifications",
  },
  {
    command: "/meet",
    label: "Meetings",
    icon: <Video className="h-3.5 w-3.5" />,
    template: "Show my upcoming meetings",
  },
  {
    command: "/weather",
    label: "Weather",
    icon: <Cloud className="h-3.5 w-3.5" />,
    template: "What's the weather in ",
  },
];

// ─── Component ──────────────────────────────────────────────────

export const AgentInput = memo(function AgentInput({
  onSend,
  isLoading,
  onStop,
}: AgentInputProps) {
  const [value, setValue] = useState("");
  const [showSlash, setShowSlash] = useState(false);
  const [filteredCommands, setFilteredCommands] =
    useState<SlashCommand[]>(SLASH_COMMANDS);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Auto-resize textarea ───────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [value]);

  // ── Slash detection ────────────────────────────────────────────
  useEffect(() => {
    if (value.startsWith("/")) {
      const query = value.toLowerCase();
      const matched = SLASH_COMMANDS.filter((c) =>
        c.command.startsWith(query)
      );
      setFilteredCommands(matched);
      setShowSlash(matched.length > 0);
      setSelectedIdx(0);
    } else {
      setShowSlash(false);
    }
  }, [value]);

  // ── Submit ─────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue("");
    setShowSlash(false);
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isLoading, onSend]);

  // ── Select slash command ───────────────────────────────────────
  const selectCommand = useCallback(
    (cmd: SlashCommand) => {
      setValue(cmd.template);
      setShowSlash(false);
      textareaRef.current?.focus();
    },
    []
  );

  // ── Keyboard handling ──────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Slash command navigation
      if (showSlash) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIdx((i) =>
            i < filteredCommands.length - 1 ? i + 1 : 0
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIdx((i) =>
            i > 0 ? i - 1 : filteredCommands.length - 1
          );
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (filteredCommands[selectedIdx]) {
            selectCommand(filteredCommands[selectedIdx]);
          }
          return;
        }
        if (e.key === "Escape") {
          setShowSlash(false);
          return;
        }
      }

      // Send on Enter (without Shift)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [showSlash, filteredCommands, selectedIdx, selectCommand, handleSend]
  );

  return (
    <div className="relative">
      {/* Slash command dropdown */}
      {showSlash && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border bg-popover p-1 shadow-lg z-50">
          {filteredCommands.map((cmd, idx) => (
            <button
              key={cmd.command}
              onClick={() => selectCommand(cmd)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                idx === selectedIdx
                  ? "bg-accent text-accent-foreground"
                  : "text-popover-foreground hover:bg-accent/50"
              )}
            >
              <span className="text-muted-foreground">{cmd.icon}</span>
              <span className="font-medium">{cmd.command}</span>
              <span className="text-xs text-muted-foreground">{cmd.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring transition-shadow">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Guru anything… (/ for commands)"
          rows={1}
          disabled={false}
          className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 max-h-[120px]"
        />

        {isLoading ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onStop}
            title="Stop generating"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-primary hover:text-primary hover:bg-primary/10"
            onClick={handleSend}
            disabled={!value.trim()}
            title="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
});
