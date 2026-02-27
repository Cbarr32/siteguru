"use client";

import React, { useState, useEffect, useCallback } from "react";
import { BasePanel } from "./BasePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Video,
  Plus,
  Zap,
  Copy,
  Check,
  ExternalLink,
  Clock,
  Users,
  X,
  Loader2,
  AlertCircle,
  LogIn,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface MeetPanelProps {
  id: string;
}

interface MeetAttendee {
  email: string;
  displayName?: string;
  responseStatus: string;
  self?: boolean;
}

interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  meetLink: string;
  htmlLink: string;
  attendees: MeetAttendee[];
  conferenceProvider?: string;
  status: string;
}

type ViewMode = "list" | "schedule";

// ─── Helpers ────────────────────────────────────────────────────

function formatMeetingDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";

  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatMeetingTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeRange(start: string, end: string): string {
  return `${formatMeetingTime(start)} – ${formatMeetingTime(end)}`;
}

function groupMeetingsByDate(meetings: Meeting[]): Map<string, Meeting[]> {
  const groups = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const key = new Date(m.startTime).toDateString();
    const group = groups.get(key) || [];
    group.push(m);
    groups.set(key, group);
  }
  return groups;
}

// ─── Copy Link Button ───────────────────────────────────────────

function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={handleCopy}
      title="Copy meeting link"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

// ─── Meeting Card ───────────────────────────────────────────────

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const attendeeCount = meeting.attendees.filter((a) => !a.self).length;
  const isOngoing =
    new Date(meeting.startTime) <= new Date() &&
    new Date(meeting.endTime) > new Date();

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-colors",
        isOngoing
          ? "border-green-500/40 bg-green-500/5"
          : "hover:bg-muted/30"
      )}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isOngoing && (
              <Badge
                variant="secondary"
                className="text-[9px] px-1 py-0 bg-green-500/20 text-green-600 dark:text-green-400 shrink-0"
              >
                LIVE
              </Badge>
            )}
            <p className="truncate text-sm font-medium">{meeting.title}</p>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatTimeRange(meeting.startTime, meeting.endTime)}
            </div>
            {attendeeCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {attendeeCount}
              </div>
            )}
          </div>
        </div>
        <CopyLinkButton link={meeting.meetLink} />
      </div>

      {/* Join button */}
      <a
        href={meeting.meetLink}
        target="_blank"
        rel="noopener noreferrer"
        title={`Join ${meeting.title}`}
        className={cn(
          "flex items-center justify-center gap-1.5 w-full rounded-md px-3 py-2 text-xs font-medium transition-colors",
          isOngoing
            ? "bg-green-600 text-white hover:bg-green-700"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        <Video className="h-3.5 w-3.5" />
        {isOngoing ? "Join Now" : "Join Meeting"}
        <ExternalLink className="h-3 w-3 ml-0.5" />
      </a>
    </div>
  );
}

// ─── Schedule Meeting Form ──────────────────────────────────────

function ScheduleMeetingForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (meeting: Meeting) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d.toTimeString().slice(0, 5);
  });
  const [duration, setDuration] = useState("60");
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addAttendee = () => {
    const email = attendeeInput.trim().toLowerCase();
    if (email && email.includes("@") && !attendees.includes(email)) {
      setAttendees((prev) => [...prev, email]);
      setAttendeeInput("");
    }
  };

  const removeAttendee = (email: string) => {
    setAttendees((prev) => prev.filter((a) => a !== email));
  };

  const handleAttendeeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addAttendee();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);

    const startISO = new Date(`${date}T${time}:00`).toISOString();

    try {
      const res = await fetch("/api/meet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startTime: startISO,
          durationMinutes: parseInt(duration, 10),
          attendees: attendees.length > 0 ? attendees : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create meeting");
      }

      const meeting = await res.json();
      onCreated(meeting);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Schedule Meeting</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="meet-title" className="text-xs">
          Meeting Title
        </Label>
        <Input
          id="meet-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Team standup"
          className="h-8 text-sm"
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="meet-date" className="text-xs">
            Date
          </Label>
          <Input
            id="meet-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-sm"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meet-time" className="text-xs">
            Time
          </Label>
          <Input
            id="meet-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-8 text-sm"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meet-duration" className="text-xs">
            Duration
          </Label>
          <select
            id="meet-duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="15">15 min</option>
            <option value="30">30 min</option>
            <option value="45">45 min</option>
            <option value="60">1 hour</option>
            <option value="90">1.5 hours</option>
            <option value="120">2 hours</option>
          </select>
        </div>
      </div>

      {/* Attendees with chips */}
      <div className="space-y-1.5">
        <Label htmlFor="meet-attendees" className="text-xs">
          Attendees
        </Label>
        {attendees.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {attendees.map((email) => (
              <Badge
                key={email}
                variant="secondary"
                className="text-[10px] px-1.5 py-0.5 gap-1"
              >
                {email}
                <button
                  type="button"
                  onClick={() => removeAttendee(email)}
                  className="hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          id="meet-attendees"
          value={attendeeInput}
          onChange={(e) => setAttendeeInput(e.target.value)}
          onKeyDown={handleAttendeeKeyDown}
          onBlur={addAttendee}
          placeholder="Type email and press Enter"
          className="h-8 text-sm"
        />
      </div>

      <Button
        type="submit"
        size="sm"
        className="w-full h-8"
        disabled={submitting || !title.trim()}
      >
        {submitting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
        ) : (
          <Video className="h-3.5 w-3.5 mr-1" />
        )}
        Create Meeting
      </Button>
    </form>
  );
}

// ─── Quick Meet Result ──────────────────────────────────────────

function QuickMeetResult({
  meeting,
  onDismiss,
}: {
  meeting: Meeting;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(meeting.meetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="rounded-lg border border-green-500/40 bg-green-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">Meeting Created!</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground truncate">
        {meeting.meetLink}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs flex-1"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3 w-3 mr-1 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 mr-1" />
          )}
          {copied ? "Copied!" : "Copy Link"}
        </Button>
        <a
          href={meeting.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          title="Join meeting"
          className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 h-7 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors flex-1"
        >
          <Video className="h-3 w-3" />
          Join
        </a>
      </div>
    </div>
  );
}

// ─── Main MeetPanel ─────────────────────────────────────────────

export function MeetPanel({ id }: MeetPanelProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [quickMeetLoading, setQuickMeetLoading] = useState(false);
  const [quickMeetResult, setQuickMeetResult] = useState<Meeting | null>(null);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meet/upcoming");
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load");
      }
      const data = await res.json();
      setMeetings(data.meetings ?? []);
      setAuthError(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const handleRefresh = useCallback(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const handleQuickMeet = async () => {
    setQuickMeetLoading(true);
    setError(null);
    try {
      const now = new Date();
      const res = await fetch("/api/meet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Quick Meeting – ${now.toLocaleDateString([], { month: "short", day: "numeric" })}`,
          startTime: now.toISOString(),
          durationMinutes: 60,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create meeting");
      }

      const meeting = await res.json();
      setQuickMeetResult(meeting);

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(meeting.meetLink);
      } catch {
        // clipboard may not be available
      }

      // Refresh meetings list
      fetchMeetings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setQuickMeetLoading(false);
    }
  };

  const handleScheduleCreated = (meeting: Meeting) => {
    setQuickMeetResult(meeting);
    fetchMeetings();
  };

  // Auth error
  if (authError) {
    return (
      <BasePanel
        id={id}
        title="Meet"
        icon={<Video className="h-4 w-4" />}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <LogIn className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">Connect Google Meet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sign in with your Google account to manage meetings
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
      title="Meet"
      icon={<Video className="h-4 w-4" />}
      isLoading={loading}
      onRefresh={handleRefresh}
      headerActions={
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            setView((v) => (v === "schedule" ? "list" : "schedule"))
          }
          title="Schedule meeting"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
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

        {/* Schedule form view */}
        {view === "schedule" && (
          <ScheduleMeetingForm
            onClose={() => setView("list")}
            onCreated={handleScheduleCreated}
          />
        )}

        {/* List view */}
        {view === "list" && (
          <>
            {/* Quick Meet button */}
            <Button
              onClick={handleQuickMeet}
              disabled={quickMeetLoading}
              className="w-full h-9 gap-1.5"
              variant="default"
            >
              {quickMeetLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {quickMeetLoading ? "Creating..." : "Quick Meet"}
            </Button>

            {/* Quick meet result */}
            {quickMeetResult && (
              <QuickMeetResult
                meeting={quickMeetResult}
                onDismiss={() => setQuickMeetResult(null)}
              />
            )}

            <Separator />

            {/* Upcoming Meetings */}
            <div className="flex-1 min-h-0">
              {meetings.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">
                    No upcoming meetings with Meet links
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[250px]">
                  <div className="space-y-3 pr-2">
                    {Array.from(groupMeetingsByDate(meetings).entries()).map(
                      ([dateKey, dateMeetings]) => (
                        <div key={dateKey}>
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1.5">
                            {formatMeetingDate(dateMeetings[0].startTime)}
                          </p>
                          <div className="space-y-2">
                            {dateMeetings.map((m) => (
                              <MeetingCard key={m.id} meeting={m} />
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          </>
        )}
      </div>
    </BasePanel>
  );
}
