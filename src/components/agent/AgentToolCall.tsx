"use client";

import React, { memo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface ToolCallPart {
  toolName: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

interface AgentToolCallProps {
  part: ToolCallPart;
}

// ─── Pretty tool names ──────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  gmail_search: "Search Gmail",
  gmail_send: "Send Email",
  gmail_read: "Read Email",
  calendar_list: "List Events",
  calendar_create: "Create Event",
  github_repos: "GitHub Repos",
  github_notifications: "GitHub Notifications",
  github_issues: "GitHub Issues",
  github_create_issue: "Create Issue",
  spotify_now_playing: "Now Playing",
  spotify_search: "Search Spotify",
  spotify_play: "Play Track",
  spotify_queue: "Queue Track",
  youtube_search: "Search YouTube",
  teams_chats: "Teams Chats",
  teams_send: "Send Teams Message",
  meet_list: "Meet Meetings",
  weather_current: "Current Weather",
  weather_forecast: "Weather Forecast",
  search_all: "Search All Services",
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name.replace(/_/g, " ");
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;

  // Show the most relevant field
  if (typeof obj.query === "string") return `"${truncate(obj.query, 40)}"`;
  if (typeof obj.to === "string") return `to: ${obj.to}`;
  if (typeof obj.title === "string") return `"${truncate(obj.title, 40)}"`;
  if (typeof obj.city === "string") return obj.city;
  if (typeof obj.trackUri === "string") return obj.trackUri.split(":").pop() ?? "";
  if (typeof obj.chatId === "string") return `chat: ${truncate(obj.chatId, 20)}`;

  // Fallback: first string value
  const firstStr = Object.values(obj).find((v) => typeof v === "string") as
    | string
    | undefined;
  if (firstStr) return truncate(firstStr, 40);
  return "";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function summarizeOutput(output: unknown): string {
  if (!output) return "";
  if (typeof output === "string") return truncate(output, 120);
  if (typeof output === "object") {
    const json = JSON.stringify(output);
    return truncate(json, 120);
  }
  return String(output);
}

// ─── Component ──────────────────────────────────────────────────

export const AgentToolCall = memo(function AgentToolCall({
  part,
}: AgentToolCallProps) {
  const [expanded, setExpanded] = useState(false);
  const isRunning =
    part.state === "input-available" ||
    part.state === "input-streaming";
  const isDone = part.state === "output-available";
  const isError = part.state === "output-error";

  const inputSummary = summarizeInput(part.input);

  return (
    <div className="mx-3 my-1">
      <button
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
          isRunning && "border-primary/30 bg-primary/5",
          isDone && "border-emerald-500/30 bg-emerald-500/5",
          isError && "border-destructive/30 bg-destructive/5",
          !isRunning && !isDone && !isError && "border-border bg-muted/30"
        )}
      >
        {/* Status icon */}
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : isError ? (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : isDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        ) : (
          <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        {/* Tool info */}
        <div className="min-w-0 flex-1">
          <span className="font-medium">{getToolLabel(part.toolName)}</span>
          {inputSummary && (
            <span className="ml-1.5 text-muted-foreground">
              ({inputSummary})
            </span>
          )}
          {isDone && (
            <span className="ml-1.5 text-muted-foreground">
              — {summarizeOutput(part.output)}
            </span>
          )}
          {isError && part.errorText && (
            <span className="ml-1.5 text-destructive">
              — {truncate(part.errorText, 60)}
            </span>
          )}
        </div>

        {/* Expand chevron */}
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-1 space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
          {/* Input */}
          {part.input !== undefined && (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                Input
              </p>
              <pre className="overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-[11px] max-h-40">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {isDone && part.output !== undefined && (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                Result
              </p>
              <pre className="overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-[11px] max-h-60">
                {typeof part.output === "string"
                  ? part.output
                  : JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {isError && part.errorText && (
            <div>
              <p className="mb-1 font-semibold text-destructive uppercase tracking-wider text-[10px]">
                Error
              </p>
              <p className="text-destructive">{part.errorText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
