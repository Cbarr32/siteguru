"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { BasePanel } from "./BasePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  MapPin,
  Users,
  Video,
  ExternalLink,
  X,
  ChevronRight,
  Loader2,
  AlertCircle,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface CalendarPanelProps {
  id: string;
}

interface CalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus: "needsAction" | "declined" | "tentative" | "accepted";
  self?: boolean;
}

interface CalendarEventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

interface ConferenceEntryPoint {
  entryPointType: string;
  uri: string;
  label?: string;
}

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
  status: string;
  htmlLink: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: ConferenceEntryPoint[];
    conferenceSolution?: { name: string };
  };
  attendees?: CalendarAttendee[];
  creator?: { email: string; displayName?: string };
  organizer?: { email: string; displayName?: string };
  colorId?: string;
}

type ViewMode = "today" | "upcoming" | "create" | "detail";

// ─── Color map for event colorIds ───────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  "1": "bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-300",
  "2": "bg-green-500/20 border-green-500/40 text-green-700 dark:text-green-300",
  "3": "bg-purple-500/20 border-purple-500/40 text-purple-700 dark:text-purple-300",
  "4": "bg-red-500/20 border-red-500/40 text-red-700 dark:text-red-300",
  "5": "bg-yellow-500/20 border-yellow-500/40 text-yellow-700 dark:text-yellow-300",
  "6": "bg-orange-500/20 border-orange-500/40 text-orange-700 dark:text-orange-300",
  "7": "bg-cyan-500/20 border-cyan-500/40 text-cyan-700 dark:text-cyan-300",
  "8": "bg-gray-500/20 border-gray-500/40 text-gray-700 dark:text-gray-300",
  "9": "bg-indigo-500/20 border-indigo-500/40 text-indigo-700 dark:text-indigo-300",
  "10": "bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  "11": "bg-rose-500/20 border-rose-500/40 text-rose-700 dark:text-rose-300",
};

const DEFAULT_EVENT_COLOR =
  "bg-primary/10 border-primary/30 text-primary";

// ─── Helpers ────────────────────────────────────────────────────

function getEventColor(colorId?: string): string {
  return (colorId && EVENT_COLORS[colorId]) || DEFAULT_EVENT_COLOR;
}

function formatTime(eventTime: CalendarEventTime): string {
  if (eventTime.dateTime) {
    return new Date(eventTime.dateTime).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return "All day";
}

function formatTimeRange(start: CalendarEventTime, end: CalendarEventTime): string {
  if (start.date && !start.dateTime) return "All day";
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";

  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getEventDateTime(evt: CalendarEvent): Date {
  return new Date(evt.start.dateTime || evt.start.date || "");
}

function getMeetLink(evt: CalendarEvent): string | null {
  if (evt.hangoutLink) return evt.hangoutLink;
  const videoEntry = evt.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === "video"
  );
  return videoEntry?.uri || null;
}

function getHourPosition(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const dateKey =
      evt.start.dateTime
        ? new Date(evt.start.dateTime).toDateString()
        : evt.start.date || "";
    const group = groups.get(dateKey) || [];
    group.push(evt);
    groups.set(dateKey, group);
  }
  return groups;
}

// ─── Response status icon/color ─────────────────────────────────

function attendeeStatusBadge(
  status: CalendarAttendee["responseStatus"]
): { color: string; label: string } {
  switch (status) {
    case "accepted":
      return { color: "bg-green-500", label: "Accepted" };
    case "declined":
      return { color: "bg-red-500", label: "Declined" };
    case "tentative":
      return { color: "bg-yellow-500", label: "Maybe" };
    default:
      return { color: "bg-gray-400", label: "Pending" };
  }
}

// ─── Timeline View (Today) ──────────────────────────────────────

const TIMELINE_START = 7; // 7 AM
const TIMELINE_END = 22; // 10 PM
const HOUR_HEIGHT = 48; // px per hour

function TimelineView({
  events,
  onSelectEvent,
}: {
  events: CalendarEvent[];
  onSelectEvent: (evt: CalendarEvent) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to current time on mount
  useEffect(() => {
    if (containerRef.current) {
      const hourPos = getHourPosition(currentTime);
      const scrollY = Math.max(
        0,
        (hourPos - TIMELINE_START) * HOUR_HEIGHT - 80
      );
      containerRef.current.scrollTop = scrollY;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayEvents = events.filter((evt) => {
    const d = getEventDateTime(evt);
    return d.toDateString() === currentTime.toDateString();
  });

  const totalHeight = (TIMELINE_END - TIMELINE_START) * HOUR_HEIGHT;
  const currentHourPos = getHourPosition(currentTime);
  const currentLineTop =
    (currentHourPos - TIMELINE_START) * HOUR_HEIGHT;

  const hours = Array.from(
    { length: TIMELINE_END - TIMELINE_START },
    (_, i) => TIMELINE_START + i
  );

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
        Today
      </h3>

      {todayEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <CalendarIcon className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            No events scheduled today
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative overflow-auto"
          style={{ maxHeight: 220 }}
        >
          <div className="relative" style={{ height: totalHeight }}>
            {/* Hour lines */}
            {hours.map((hour) => {
              const top = (hour - TIMELINE_START) * HOUR_HEIGHT;
              return (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-muted/40"
                  style={{ top }}
                >
                  <span className="absolute -top-2.5 left-0 text-[10px] text-muted-foreground w-10">
                    {hour === 0
                      ? "12 AM"
                      : hour < 12
                        ? `${hour} AM`
                        : hour === 12
                          ? "12 PM"
                          : `${hour - 12} PM`}
                  </span>
                </div>
              );
            })}

            {/* Current time indicator */}
            {currentHourPos >= TIMELINE_START &&
              currentHourPos <= TIMELINE_END && (
                <div
                  className="absolute left-10 right-0 z-20 flex items-center"
                  style={{ top: currentLineTop }}
                >
                  <div className="h-2 w-2 rounded-full bg-red-500 -ml-1" />
                  <div className="flex-1 h-px bg-red-500" />
                </div>
              )}

            {/* Event blocks */}
            {todayEvents.map((evt) => {
              const startDate = new Date(
                evt.start.dateTime || evt.start.date || ""
              );
              const endDate = new Date(
                evt.end.dateTime || evt.end.date || ""
              );
              const startHour = getHourPosition(startDate);
              const endHour = getHourPosition(endDate);
              const top = Math.max(
                0,
                (startHour - TIMELINE_START) * HOUR_HEIGHT
              );
              const height = Math.max(
                20,
                (endHour - startHour) * HOUR_HEIGHT
              );
              const meetLink = getMeetLink(evt);

              return (
                <button
                  key={evt.id}
                  onClick={() => onSelectEvent(evt)}
                  className={cn(
                    "absolute left-12 right-1 rounded-md border px-2 py-1 text-left transition-opacity hover:opacity-80 z-10 overflow-hidden",
                    getEventColor(evt.colorId)
                  )}
                  style={{ top, height: Math.min(height, totalHeight - top) }}
                  title={evt.summary}
                >
                  <p className="truncate text-xs font-medium leading-tight">
                    {evt.summary}
                  </p>
                  <p className="truncate text-[10px] opacity-75">
                    {formatTimeRange(evt.start, evt.end)}
                  </p>
                  {meetLink && height > 35 && (
                    <a
                      href={meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Join ${evt.summary} meeting`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-0.5 mt-0.5 text-[10px] font-medium hover:underline"
                    >
                      <Video className="h-2.5 w-2.5" />
                      Join
                    </a>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Upcoming Events List ───────────────────────────────────────

function UpcomingList({
  events,
  onSelectEvent,
}: {
  events: CalendarEvent[];
  onSelectEvent: (evt: CalendarEvent) => void;
}) {
  const grouped = groupByDate(events);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <CalendarIcon className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No upcoming events</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
        Upcoming
      </h3>
      <ScrollArea className="h-[200px]">
        <div className="space-y-2 pr-2">
          {Array.from(grouped.entries()).map(([dateKey, dateEvents]) => (
            <div key={dateKey}>
              <p className="text-[11px] font-semibold text-muted-foreground px-1 mb-1">
                {formatDate(dateEvents[0].start.dateTime || dateEvents[0].start.date || "")}
              </p>
              <div className="space-y-0.5">
                {dateEvents.map((evt) => {
                  const meetLink = getMeetLink(evt);
                  return (
                    <button
                      key={evt.id}
                      onClick={() => onSelectEvent(evt)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50 transition-colors group"
                    >
                      <div
                        className={cn(
                          "w-1 self-stretch rounded-full shrink-0",
                          evt.colorId && EVENT_COLORS[evt.colorId]
                            ? EVENT_COLORS[evt.colorId].split(" ")[0].replace("/20", "")
                            : "bg-primary"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {evt.summary}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatTimeRange(evt.start, evt.end)}
                        </p>
                      </div>
                      {meetLink && (
                        <a
                          href={meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Join ${evt.summary} meeting`}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                        >
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 gap-0.5 hover:bg-primary hover:text-primary-foreground transition-colors"
                          >
                            <Video className="h-2.5 w-2.5" />
                            Join
                          </Badge>
                        </a>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Event Detail View ──────────────────────────────────────────

function EventDetail({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const meetLink = getMeetLink(event);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{event.summary}</h3>
          <p className="text-xs text-muted-foreground">
            {formatTimeRange(event.start, event.end)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Separator />

      {/* Description */}
      {event.description && (
        <div>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
            {event.description.replace(/<[^>]*>/g, "")}
          </p>
        </div>
      )}

      {/* Location */}
      {event.location && (
        <div className="flex items-start gap-2">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs">{event.location}</p>
        </div>
      )}

      {/* Join link */}
      {meetLink && (
        <a
          href={meetLink}
          target="_blank"
          rel="noopener noreferrer"
          title={`Join ${event.summary} meeting`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Video className="h-3.5 w-3.5" />
          Join Meeting
        </a>
      )}

      {/* Attendees */}
      {event.attendees && event.attendees.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">
              {event.attendees.length} attendee
              {event.attendees.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-1 pl-5">
            {event.attendees.slice(0, 10).map((att) => {
              const { color, label } = attendeeStatusBadge(att.responseStatus);
              return (
                <div
                  key={att.email}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full shrink-0", color)}
                    title={label}
                  />
                  <span className="truncate">
                    {att.displayName || att.email}
                    {att.self && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </span>
                </div>
              );
            })}
            {event.attendees.length > 10 && (
              <p className="text-[10px] text-muted-foreground">
                +{event.attendees.length - 10} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Open in Google Calendar */}
      {event.htmlLink && (
        <a
          href={event.htmlLink}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Google Calendar"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Open in Calendar
        </a>
      )}
    </div>
  );
}

// ─── Create Event Form ──────────────────────────────────────────

function CreateEventForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [startTime, setStartTime] = useState(() => {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d.toTimeString().slice(0, 5);
  });
  const [endTime, setEndTime] = useState(() => {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toTimeString().slice(0, 5);
  });
  const [description, setDescription] = useState("");
  const [attendeesInput, setAttendeesInput] = useState("");
  const [addMeetLink, setAddMeetLink] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);

    const startISO = new Date(`${date}T${startTime}:00`).toISOString();
    const endISO = new Date(`${date}T${endTime}:00`).toISOString();
    const attendees = attendeesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startTime: startISO,
          endTime: endISO,
          description: description.trim() || undefined,
          attendees: attendees.length > 0 ? attendees : undefined,
          addMeetLink,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create event");
      }

      onCreated();
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
        <h3 className="text-sm font-semibold">New Event</h3>
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
        <Label htmlFor="evt-title" className="text-xs">
          Title
        </Label>
        <Input
          id="evt-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          className="h-8 text-sm"
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="evt-date" className="text-xs">
            Date
          </Label>
          <Input
            id="evt-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-sm"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="evt-start" className="text-xs">
            Start
          </Label>
          <Input
            id="evt-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-8 text-sm"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="evt-end" className="text-xs">
            End
          </Label>
          <Input
            id="evt-end"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-8 text-sm"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="evt-desc" className="text-xs">
          Description
        </Label>
        <Textarea
          id="evt-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="min-h-[60px] text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="evt-attendees" className="text-xs">
          Attendees
        </Label>
        <Input
          id="evt-attendees"
          value={attendeesInput}
          onChange={(e) => setAttendeesInput(e.target.value)}
          placeholder="email1@example.com, email2@example.com"
          className="h-8 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={addMeetLink}
          onClick={() => setAddMeetLink(!addMeetLink)}
          className={cn(
            "relative h-5 w-9 rounded-full transition-colors",
            addMeetLink ? "bg-primary" : "bg-muted-foreground/30"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
              addMeetLink && "translate-x-4"
            )}
          />
        </button>
        <div className="flex items-center gap-1">
          <Video className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs">Add Google Meet</span>
        </div>
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
          <Plus className="h-3.5 w-3.5 mr-1" />
        )}
        Create Event
      </Button>
    </form>
  );
}

// ─── Main CalendarPanel ─────────────────────────────────────────

export function CalendarPanel({ id }: CalendarPanelProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("today");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/events?daysAhead=7");
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load");
      }
      const data = await res.json();
      setEvents(data.events ?? []);
      setAuthError(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSelectEvent = useCallback((evt: CalendarEvent) => {
    setSelectedEvent(evt);
    setView("detail");
  }, []);

  const handleRefresh = useCallback(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Auth error
  if (authError) {
    return (
      <BasePanel
        id={id}
        title="Calendar"
        icon={<CalendarIcon className="h-4 w-4" />}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <LogIn className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">Connect Google Calendar</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sign in with your Google account to see your calendar
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
      title="Calendar"
      icon={<CalendarIcon className="h-4 w-4" />}
      isLoading={loading}
      onRefresh={handleRefresh}
      headerActions={
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            setView((v) => (v === "create" ? "today" : "create"))
          }
          title="Create event"
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

        {/* Create Event Form */}
        {view === "create" && (
          <CreateEventForm
            onClose={() => setView("today")}
            onCreated={handleRefresh}
          />
        )}

        {/* Event Detail */}
        {view === "detail" && selectedEvent && (
          <EventDetail
            event={selectedEvent}
            onClose={() => {
              setSelectedEvent(null);
              setView("today");
            }}
          />
        )}

        {/* Main views: Today + Upcoming */}
        {(view === "today" || view === "upcoming") && (
          <>
            {/* Quick tabs */}
            <div className="flex gap-0.5 border-b pb-1 shrink-0">
              <button
                onClick={() => setView("today")}
                className={cn(
                  "flex items-center gap-1 rounded-t-md px-2 py-1 text-xs transition-colors",
                  view === "today"
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Clock className="h-3 w-3" />
                Today
                {events.filter(
                  (e) =>
                    getEventDateTime(e).toDateString() ===
                    new Date().toDateString()
                ).length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-0.5 h-4 min-w-[16px] px-1 text-[10px]"
                  >
                    {
                      events.filter(
                        (e) =>
                          getEventDateTime(e).toDateString() ===
                          new Date().toDateString()
                      ).length
                    }
                  </Badge>
                )}
              </button>
              <button
                onClick={() => setView("upcoming")}
                className={cn(
                  "flex items-center gap-1 rounded-t-md px-2 py-1 text-xs transition-colors",
                  view === "upcoming"
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <CalendarIcon className="h-3 w-3" />
                Upcoming
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0">
              {view === "today" && (
                <TimelineView
                  events={events}
                  onSelectEvent={handleSelectEvent}
                />
              )}
              {view === "upcoming" && (
                <UpcomingList
                  events={events}
                  onSelectEvent={handleSelectEvent}
                />
              )}
            </div>
          </>
        )}
      </div>
    </BasePanel>
  );
}
