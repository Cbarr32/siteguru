"use client";

import React, { useEffect, useState, useCallback } from "react";
import { BasePanel } from "@/components/panels/BasePanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Inbox,
  Send,
  Star,
  StarOff,
  ArrowLeft,
  Pencil,
  MailOpen,
  MailCheck,
  Archive,
  Trash2,
  Search,
  Loader2,
  AlertCircle,
  LogIn,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import DOMPurify from "dompurify";

// ─── Types ──────────────────────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  bodyType: "html" | "plain";
  isUnread: boolean;
  isStarred: boolean;
}

interface InboxResponse {
  messages: GmailMessage[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

type GmailView = "inbox" | "detail" | "compose";

interface GmailPanelProps {
  id: string;
  onRemove?: (id: string) => void;
  onToggleExpand?: (id: string) => void;
  isExpanded?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────

function parseFromField(from: string): { name: string; email: string } {
  const match = from.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
  if (match) {
    return {
      name: match[1].trim() || match[2].trim(),
      email: match[2].trim(),
    };
  }
  return { name: from, email: from };
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "b", "i", "u", "strong", "em", "a", "img",
      "div", "span", "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th",
      "blockquote", "pre", "code", "hr",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "style", "class", "target"],
    ADD_ATTR: ["target"],
  });
}

// ─── Component ──────────────────────────────────────────────────

export function GmailPanel({
  id,
  onRemove,
  onToggleExpand,
  isExpanded = false,
}: GmailPanelProps) {
  // State
  const [view, setView] = useState<GmailView>("inbox");
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [unreadCount, setUnreadCount] = useState(0);

  // Compose form
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [replyToId, setReplyToId] = useState<string | undefined>();

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchInbox = useCallback(
    async (query?: string, pageToken?: string) => {
      setLoading(true);
      setError(null);
      setAuthError(false);

      try {
        const params = new URLSearchParams({ maxResults: "20" });
        if (pageToken) params.set("pageToken", pageToken);
        if (query) params.set("q", query);

        const res = await fetch(`/api/gmail/inbox?${params.toString()}`);

        if (res.status === 401) {
          setAuthError(true);
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to fetch inbox");
        }

        const data: InboxResponse = await res.json();
        setMessages(pageToken ? (prev) => [...prev, ...data.messages] : data.messages);
        setNextPageToken(data.nextPageToken);
        setUnreadCount(data.messages.filter((m) => m.isUnread).length);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error fetching inbox");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchMessageDetail = useCallback(async (messageId: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/gmail/${messageId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch message");
      }

      const message: GmailMessage = await res.json();
      setSelectedMessage(message);
      setView("detail");

      // Mark as read if unread
      if (message.isUnread) {
        await fetch(`/api/gmail/${messageId}/modify`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
        });
        // Update local state
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, isUnread: false } : m
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching message");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!composeTo || !composeSubject || !composeBody) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          body: composeBody,
          replyToMessageId: replyToId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send email");
      }

      // Clear compose form and return to inbox
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setReplyToId(undefined);
      setView("inbox");
      fetchInbox(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error sending email");
    } finally {
      setSending(false);
    }
  }, [composeTo, composeSubject, composeBody, replyToId, fetchInbox, searchQuery]);

  const handleToggleStar = useCallback(
    async (messageId: string, isStarred: boolean) => {
      try {
        await fetch(`/api/gmail/${messageId}/modify`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isStarred
              ? { removeLabelIds: ["STARRED"] }
              : { addLabelIds: ["STARRED"] }
          ),
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, isStarred: !isStarred } : m
          )
        );
      } catch {
        // Silently fail star toggle
      }
    },
    []
  );

  const handleArchive = useCallback(
    async (messageId: string) => {
      try {
        await fetch(`/api/gmail/${messageId}/modify`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
        });
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        if (selectedMessage?.id === messageId) {
          setView("inbox");
          setSelectedMessage(null);
        }
      } catch {
        // Silently fail
      }
    },
    [selectedMessage]
  );

  const handleTrash = useCallback(
    async (messageId: string) => {
      try {
        await fetch(`/api/gmail/${messageId}/modify`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }),
        });
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        if (selectedMessage?.id === messageId) {
          setView("inbox");
          setSelectedMessage(null);
        }
      } catch {
        // Silently fail
      }
    },
    [selectedMessage]
  );

  const handleReply = useCallback((message: GmailMessage) => {
    const sender = parseFromField(message.from);
    setComposeTo(sender.email);
    setComposeSubject(
      message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`
    );
    setComposeBody("");
    setReplyToId(message.id);
    setView("compose");
  }, []);

  // ─── Effects ────────────────────────────────────────────────

  useEffect(() => {
    fetchInbox();
    const interval = setInterval(() => fetchInbox(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchInbox]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInbox(searchQuery);
  };

  // ─── Header Actions ─────────────────────────────────────────

  const headerActions = (
    <div className="flex items-center gap-1 mr-1">
      {view !== "inbox" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => {
            setView("inbox");
            setSelectedMessage(null);
          }}
        >
          <ArrowLeft className="h-3 w-3 mr-1" />
          Back
        </Button>
      )}
      <Button
        variant={view === "compose" ? "secondary" : "ghost"}
        size="sm"
        className="h-6 px-2 text-[10px]"
        onClick={() => {
          setComposeTo("");
          setComposeSubject("");
          setComposeBody("");
          setReplyToId(undefined);
          setView("compose");
        }}
      >
        <Pencil className="h-3 w-3 mr-1" />
        Compose
      </Button>
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────

  return (
    <BasePanel
      id={id}
      title={`Gmail${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
      icon={<Mail className="h-4 w-4" />}
      isLoading={loading && view === "inbox" && messages.length === 0}
      isExpanded={isExpanded}
      onRemove={onRemove}
      onToggleExpand={onToggleExpand}
      onRefresh={() => fetchInbox(searchQuery)}
      headerActions={headerActions}
    >
      {authError ? (
        <AuthPrompt />
      ) : error ? (
        <ErrorDisplay message={error} onRetry={() => fetchInbox(searchQuery)} />
      ) : view === "inbox" ? (
        <InboxView
          messages={messages}
          loading={loading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearch={handleSearch}
          onSelect={fetchMessageDetail}
          onToggleStar={handleToggleStar}
          onArchive={handleArchive}
          onTrash={handleTrash}
          nextPageToken={nextPageToken}
          onLoadMore={() => fetchInbox(searchQuery, nextPageToken)}
        />
      ) : view === "detail" && selectedMessage ? (
        <DetailView
          message={selectedMessage}
          onReply={handleReply}
          onArchive={handleArchive}
          onTrash={handleTrash}
          onToggleStar={handleToggleStar}
        />
      ) : view === "compose" ? (
        <ComposeView
          to={composeTo}
          subject={composeSubject}
          body={composeBody}
          sending={sending}
          isReply={!!replyToId}
          onToChange={setComposeTo}
          onSubjectChange={setComposeSubject}
          onBodyChange={setComposeBody}
          onSend={handleSend}
          onCancel={() => setView("inbox")}
        />
      ) : null}
    </BasePanel>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────

function AuthPrompt() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
      <LogIn className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">Sign in to access Gmail</p>
        <p className="text-xs text-muted-foreground mt-1">
          Connect your Google account to view and send emails
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => window.location.href = "/api/auth/signin"}
      >
        Sign in with Google
      </Button>
    </div>
  );
}

function ErrorDisplay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function InboxView({
  messages,
  loading,
  searchQuery,
  onSearchChange,
  onSearch,
  onSelect,
  onToggleStar,
  onArchive,
  onTrash,
  nextPageToken,
  onLoadMore,
}: {
  messages: GmailMessage[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearch: (e: React.FormEvent) => void;
  onSelect: (id: string) => void;
  onToggleStar: (id: string, starred: boolean) => void;
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  nextPageToken?: string;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Search bar */}
      <form onSubmit={onSearch} className="flex gap-2">
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search mail..."
          className="h-8 text-xs"
        />
        <Button type="submit" size="sm" className="h-8 px-3 text-xs">
          <Search className="h-3 w-3" />
        </Button>
      </form>

      {/* Message list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1">
          {messages.length === 0 && !loading ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              No messages found
            </div>
          ) : (
            messages.map((msg) => (
              <MessageRow
                key={msg.id}
                message={msg}
                onSelect={() => onSelect(msg.id)}
                onToggleStar={() => onToggleStar(msg.id, msg.isStarred)}
                onArchive={() => onArchive(msg.id)}
                onTrash={() => onTrash(msg.id)}
              />
            ))
          )}

          {/* Load more */}
          {nextPageToken && (
            <Button
              variant="ghost"
              size="sm"
              className="mx-auto mt-2 text-xs"
              onClick={onLoadMore}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Load more
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MessageRow({
  message,
  onSelect,
  onToggleStar,
  onArchive,
  onTrash,
}: {
  message: GmailMessage;
  onSelect: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onTrash: () => void;
}) {
  const sender = parseFromField(message.from);
  const dateStr = (() => {
    try {
      return formatDistanceToNow(new Date(message.date), { addSuffix: true });
    } catch {
      return message.date;
    }
  })();

  return (
    <div
      className={`group flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors hover:bg-accent/50 ${
        message.isUnread ? "bg-accent/20 border-primary/20" : ""
      }`}
      onClick={onSelect}
    >
      {/* Star */}
      <button
        className="shrink-0 mt-0.5"
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar();
        }}
      >
        {message.isStarred ? (
          <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
        ) : (
          <StarOff className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-xs truncate ${
              message.isUnread ? "font-semibold" : "text-muted-foreground"
            }`}
          >
            {sender.name}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {dateStr}
          </span>
        </div>
        <div
          className={`text-xs truncate ${
            message.isUnread ? "font-medium" : ""
          }`}
        >
          {message.subject || "(no subject)"}
        </div>
        <div className="text-[10px] text-muted-foreground truncate mt-0.5">
          {message.snippet}
        </div>

        {/* Labels */}
        <div className="flex items-center gap-1 mt-1">
          {message.isUnread && (
            <Badge variant="default" className="h-4 px-1.5 text-[9px]">
              New
            </Badge>
          )}
        </div>
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-1 rounded hover:bg-accent"
          title="Archive"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
        >
          <Archive className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          className="p-1 rounded hover:bg-destructive/10"
          title="Trash"
          onClick={(e) => {
            e.stopPropagation();
            onTrash();
          }}
        >
          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  );
}

function DetailView({
  message,
  onReply,
  onArchive,
  onTrash,
  onToggleStar,
}: {
  message: GmailMessage;
  onReply: (msg: GmailMessage) => void;
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onToggleStar: (id: string, starred: boolean) => void;
}) {
  const sender = parseFromField(message.from);
  const dateStr = (() => {
    try {
      return new Date(message.date).toLocaleString();
    } catch {
      return message.date;
    }
  })();

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="border-b pb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug">
            {message.subject || "(no subject)"}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onToggleStar(message.id, message.isStarred)}
              title={message.isStarred ? "Unstar" : "Star"}
            >
              {message.isStarred ? (
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
              ) : (
                <Star className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
            {sender.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium">{sender.name}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {sender.email}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">{dateStr}</div>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        {message.bodyType === "html" ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert text-xs leading-relaxed [&_a]:text-primary [&_img]:max-w-full"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(message.body),
            }}
          />
        ) : (
          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground">
            {message.body}
          </pre>
        )}
      </ScrollArea>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t pt-3">
        <Button size="sm" className="h-7 text-xs" onClick={() => onReply(message)}>
          <Send className="h-3 w-3 mr-1" />
          Reply
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onArchive(message.id)}
        >
          <Archive className="h-3 w-3 mr-1" />
          Archive
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs hover:text-destructive"
          onClick={() => onTrash(message.id)}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Trash
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {message.isUnread ? (
            <MailOpen className="h-3 w-3" />
          ) : (
            <MailCheck className="h-3 w-3" />
          )}
          {message.isUnread ? "Unread" : "Read"}
        </div>
      </div>
    </div>
  );
}

function ComposeView({
  to,
  subject,
  body,
  sending,
  isReply,
  onToChange,
  onSubjectChange,
  onBodyChange,
  onSend,
  onCancel,
}: {
  to: string;
  subject: string;
  body: string;
  sending: boolean;
  isReply: boolean;
  onToChange: (v: string) => void;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="text-sm font-medium">
        {isReply ? "Reply" : "New Message"}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="compose-to" className="text-xs w-14 shrink-0">
            To:
          </Label>
          <Input
            id="compose-to"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            placeholder="recipient@example.com"
            className="h-8 text-xs"
            type="email"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="compose-subject" className="text-xs w-14 shrink-0">
            Subject:
          </Label>
          <Input
            id="compose-subject"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="Email subject"
            className="h-8 text-xs"
          />
        </div>
      </div>

      <Textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder="Write your message..."
        className="flex-1 text-xs min-h-[120px] resize-none"
      />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={onSend}
          disabled={sending || !to || !subject || !body}
        >
          {sending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Send className="h-3 w-3 mr-1" />
          )}
          {sending ? "Sending..." : "Send"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={onCancel}
          disabled={sending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
