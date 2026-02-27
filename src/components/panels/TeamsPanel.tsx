"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { BasePanel } from "./BasePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Users,
  User,
  Loader2,
  AlertCircle,
  LogIn,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface TeamsPanelProps {
  id: string;
}

interface TeamsChatMember {
  id: string;
  displayName: string;
  email?: string;
  userId?: string;
}

interface TeamsChatMessage {
  id: string;
  createdDateTime: string;
  body: {
    contentType: "text" | "html";
    content: string;
  };
  from?: {
    user?: {
      id: string;
      displayName: string;
    };
    application?: {
      id: string;
      displayName: string;
    };
  };
  messageType: string;
}

interface TeamsChat {
  id: string;
  topic: string | null;
  chatType: "oneOnOne" | "group" | "meeting";
  lastUpdatedDateTime: string;
  members?: TeamsChatMember[];
  lastMessagePreview?: {
    id: string;
    createdDateTime: string;
    body: {
      contentType: "text" | "html";
      content: string;
    };
    from?: {
      user?: {
        id: string;
        displayName: string;
      };
      application?: {
        id: string;
        displayName: string;
      };
    };
  };
  unreadMessageCount?: number;
}

interface TeamsPresence {
  availability:
    | "Available"
    | "Busy"
    | "DoNotDisturb"
    | "Away"
    | "BeRightBack"
    | "Offline"
    | "PresenceUnknown";
  activity: string;
}

type ViewMode = "list" | "chat";

// ─── Presence helpers ───────────────────────────────────────────

const PRESENCE_CONFIG: Record<
  string,
  { color: string; label: string; dotClass: string }
> = {
  Available: {
    color: "text-green-500",
    label: "Available",
    dotClass: "bg-green-500",
  },
  Busy: {
    color: "text-red-500",
    label: "Busy",
    dotClass: "bg-red-500",
  },
  DoNotDisturb: {
    color: "text-red-600",
    label: "Do Not Disturb",
    dotClass: "bg-red-600",
  },
  Away: {
    color: "text-yellow-500",
    label: "Away",
    dotClass: "bg-yellow-500",
  },
  BeRightBack: {
    color: "text-yellow-500",
    label: "Be Right Back",
    dotClass: "bg-yellow-500",
  },
  Offline: {
    color: "text-gray-400",
    label: "Offline",
    dotClass: "bg-gray-400",
  },
  PresenceUnknown: {
    color: "text-gray-400",
    label: "Unknown",
    dotClass: "bg-gray-400",
  },
};

function getPresenceConfig(availability: string) {
  return (
    PRESENCE_CONFIG[availability] ??
    PRESENCE_CONFIG.PresenceUnknown
  );
}

const PRESENCE_OPTIONS = [
  "Available",
  "Busy",
  "DoNotDisturb",
  "Away",
  "Offline",
] as const;

// ─── Helpers ────────────────────────────────────────────────────

function getChatDisplayName(chat: TeamsChat): string {
  if (chat.topic) return chat.topic;
  if (chat.members && chat.members.length > 0) {
    // Filter out the current user (we can't easily know who, so show all)
    const names = chat.members
      .map((m) => m.displayName)
      .filter(Boolean)
      .slice(0, 3);
    if (names.length === 0) return "Chat";
    const label = names.join(", ");
    if (chat.members.length > 3) return `${label} +${chat.members.length - 3}`;
    return label;
  }
  return chat.chatType === "oneOnOne" ? "Direct Message" : "Group Chat";
}

function getChatIcon(chat: TeamsChat) {
  return chat.chatType === "oneOnOne" ? (
    <User className="h-4 w-4" />
  ) : (
    <Users className="h-4 w-4" />
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Presence Status Bar ────────────────────────────────────────

function PresenceBar({
  presence,
  onChangeStatus,
}: {
  presence: TeamsPresence | null;
  onChangeStatus: (status: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  if (!presence) return null;

  const config = getPresenceConfig(presence.availability);

  return (
    <div className="relative">
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
        title="Change status"
      >
        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", config.dotClass)} />
        <span className={cn("text-xs font-medium", config.color)}>
          {config.label}
        </span>
        {presence.activity && presence.activity !== presence.availability && (
          <span className="text-[10px] text-muted-foreground">
            — {presence.activity}
          </span>
        )}
      </button>

      {showPicker && (
        <div className="absolute top-full left-0 z-30 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
          {PRESENCE_OPTIONS.map((opt) => {
            const optConfig = getPresenceConfig(opt);
            return (
              <button
                key={opt}
                onClick={() => {
                  onChangeStatus(opt);
                  setShowPicker(false);
                }}
                className={cn(
                  "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-xs hover:bg-muted transition-colors",
                  presence.availability === opt && "bg-muted"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", optConfig.dotClass)} />
                {optConfig.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Chat List View ─────────────────────────────────────────────

function ChatList({
  chats,
  onSelectChat,
}: {
  chats: TeamsChat[];
  onSelectChat: (chat: TeamsChat) => void;
}) {
  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No recent chats</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[320px]">
      <div className="space-y-0.5 pr-2">
        {chats.map((chat) => {
          const preview = chat.lastMessagePreview;
          const previewText = preview
            ? stripHtml(preview.body.content)
            : "";
          const senderName = preview?.from?.user?.displayName;
          const timestamp = preview?.createdDateTime || chat.lastUpdatedDateTime;
          const unread = chat.unreadMessageCount ?? 0;

          return (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat)}
              className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-muted/50 transition-colors group"
            >
              {/* Avatar / Icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                {getChatIcon(chat)}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p
                    className={cn(
                      "truncate text-sm",
                      unread > 0 ? "font-semibold" : "font-medium"
                    )}
                  >
                    {getChatDisplayName(chat)}
                  </p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatTimestamp(timestamp)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <p className="truncate text-xs text-muted-foreground">
                    {senderName && (
                      <span className="font-medium text-foreground/70">
                        {senderName.split(" ")[0]}:{" "}
                      </span>
                    )}
                    {previewText || "No messages yet"}
                  </p>
                  {unread > 0 && (
                    <Badge className="h-4 min-w-[16px] px-1 text-[10px] shrink-0">
                      {unread}
                    </Badge>
                  )}
                </div>
              </div>

              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-2.5" />
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ─── Chat Thread View ───────────────────────────────────────────

function ChatThread({
  chat,
  onBack,
}: {
  chat: TeamsChat;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<TeamsChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/teams/chats/${encodeURIComponent(chat.id)}/messages`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load messages");
      }
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [chat.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Scroll to bottom when messages load
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      const res = await fetch(
        `/api/teams/chats/${encodeURIComponent(chat.id)}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send");
      }
      const sent = await res.json();
      setMessages((prev) => [...prev, sent]);
      setInputValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full gap-1">
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs">
            {getChatIcon(chat)}
          </div>
          <p className="truncate text-sm font-medium">
            {getChatDisplayName(chat)}
          </p>
        </div>
      </div>

      <Separator />

      {/* Messages */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto min-h-0 space-y-2 py-1"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                No messages in this chat
              </p>
            </div>
          ) : (
            messages
              .filter((m) => m.messageType === "message")
              .map((msg) => {
                const senderName =
                  msg.from?.user?.displayName ||
                  msg.from?.application?.displayName ||
                  "Unknown";
                const content = stripHtml(msg.body.content);
                if (!content) return null;

                return (
                  <div key={msg.id} className="flex items-start gap-2 px-1">
                    {/* Avatar */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                      {getInitials(senderName)}
                    </div>

                    {/* Message */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-semibold">
                          {senderName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatMessageTime(msg.createdDateTime)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">
                        {content}
                      </p>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-1.5 shrink-0 pt-1 border-t">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          className="h-8 text-sm flex-1"
          disabled={sending}
        />
        <Button
          variant="default"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleSend}
          disabled={sending || !inputValue.trim()}
          title="Send message"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Main TeamsPanel ────────────────────────────────────────────

export function TeamsPanel({ id }: TeamsPanelProps) {
  const [chats, setChats] = useState<TeamsChat[]>([]);
  const [presence, setPresence] = useState<TeamsPresence | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [selectedChat, setSelectedChat] = useState<TeamsChat | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [chatsRes, presenceRes] = await Promise.allSettled([
        fetch("/api/teams/chats"),
        fetch("/api/teams/presence"),
      ]);

      // Handle chats
      if (chatsRes.status === "fulfilled") {
        const res = chatsRes.value;
        if (res.status === 401) {
          setAuthError(true);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setChats(data.chats ?? []);
        } else {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load chats");
        }
      }

      // Handle presence
      if (presenceRes.status === "fulfilled") {
        const res = presenceRes.value;
        if (res.ok) {
          const data = await res.json();
          setPresence(data);
        }
      }

      setAuthError(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const handleChangePresence = useCallback((_status: string) => {
    // Microsoft Graph requires Presence.ReadWrite.All (app-only) to
    // change presence. For now, this is a placeholder — the picker
    // still shows the UI but the API would need elevated permissions.
    // We update optimistically for a snappy feel.
    setPresence((prev) =>
      prev
        ? { ...prev, availability: _status as TeamsPresence["availability"] }
        : null
    );
  }, []);

  const handleSelectChat = useCallback((chat: TeamsChat) => {
    setSelectedChat(chat);
    setView("chat");
  }, []);

  // Total unread count across all chats
  const totalUnread = chats.reduce(
    (sum, c) => sum + (c.unreadMessageCount ?? 0),
    0
  );

  // Auth error
  if (authError) {
    return (
      <BasePanel
        id={id}
        title="Teams"
        icon={<MessageSquare className="h-4 w-4" />}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <LogIn className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">Connect Microsoft Teams</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sign in with your Microsoft account to see your chats
            </p>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => window.open("/api/auth/signin", "_blank")}
          >
            Sign In
          </Button>
        </div>
      </BasePanel>
    );
  }

  return (
    <BasePanel
      id={id}
      title="Teams"
      icon={<MessageSquare className="h-4 w-4" />}
      isLoading={loading}
      onRefresh={handleRefresh}
      headerActions={
        totalUnread > 0 ? (
          <Badge className="text-[10px] px-1.5 py-0 h-4">
            {totalUnread}
          </Badge>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2 h-full">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Presence indicator */}
        {view === "list" && (
          <PresenceBar
            presence={presence}
            onChangeStatus={handleChangePresence}
          />
        )}

        {/* Views */}
        {view === "list" && (
          <>
            <Separator />
            <ChatList chats={chats} onSelectChat={handleSelectChat} />
          </>
        )}

        {view === "chat" && selectedChat && (
          <ChatThread
            chat={selectedChat}
            onBack={() => {
              setSelectedChat(null);
              setView("list");
            }}
          />
        )}
      </div>
    </BasePanel>
  );
}
