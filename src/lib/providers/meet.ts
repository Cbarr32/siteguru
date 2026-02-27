/**
 * Google Meet Provider — via Google Calendar API v3
 *
 * Creates meetings with Google Meet links and retrieves upcoming meetings
 * that have conferenceData attached. Reuses the shared Google OAuth2 token
 * (same scopes as the Calendar provider).
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// ─── Types ──────────────────────────────────────────────────────

export interface MeetAttendee {
  email: string;
  displayName?: string;
  responseStatus: "needsAction" | "declined" | "tentative" | "accepted";
  self?: boolean;
}

export interface MeetEntryPoint {
  entryPointType: string;
  uri: string;
  label?: string;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  meetLink: string;
  htmlLink: string;
  attendees: MeetAttendee[];
  conferenceProvider?: string;
  entryPoints: MeetEntryPoint[];
  status: string;
}

export interface CreateMeetInput {
  title: string;
  startTime: string;
  durationMinutes?: number;
  attendees?: string[];
}

// ─── Errors ─────────────────────────────────────────────────────

export class MeetApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "MeetApiError";
  }
}

// ─── Internal fetch helper ──────────────────────────────────────

async function meetFetch<T>(
  token: string,
  endpoint: string,
  options: {
    method?: string;
    params?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = "GET", params = {}, body } = options;

  const url = new URL(`${CALENDAR_API}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const fetchOptions: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  const res = await fetch(url.toString(), fetchOptions);

  if (!res.ok) {
    let message = `Meet API error: ${res.status}`;
    try {
      const errBody = await res.json();
      message = errBody?.error?.message || message;
    } catch {
      // ignore parse errors
    }
    throw new MeetApiError(message, res.status);
  }

  return (await res.json()) as T;
}

// ─── Parse helper ───────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseMeeting(item: any): Meeting | null {
  // Must have a Meet / conference link
  const meetLink =
    item.hangoutLink ||
    (item.conferenceData?.entryPoints || []).find(
      (ep: any) => ep.entryPointType === "video"
    )?.uri;

  if (!meetLink) return null;

  return {
    id: item.id || "",
    title: item.summary || "(No title)",
    description: item.description || undefined,
    startTime: item.start?.dateTime || item.start?.date || "",
    endTime: item.end?.dateTime || item.end?.date || "",
    meetLink,
    htmlLink: item.htmlLink || "",
    attendees: (item.attendees || []).map((a: any) => ({
      email: a.email || "",
      displayName: a.displayName || undefined,
      responseStatus: a.responseStatus || "needsAction",
      self: a.self || false,
    })),
    conferenceProvider:
      item.conferenceData?.conferenceSolution?.name || "Google Meet",
    entryPoints: (item.conferenceData?.entryPoints || []).map((ep: any) => ({
      entryPointType: ep.entryPointType || "",
      uri: ep.uri || "",
      label: ep.label || undefined,
    })),
    status: item.status || "confirmed",
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Public API ─────────────────────────────────────────────────

/**
 * Create a Calendar event with a Google Meet link.
 *
 * Uses conferenceData.createRequest with hangoutsMeet to auto-generate
 * the meeting. Requires conferenceDataVersion=1 query param.
 */
export async function createMeetLink(
  token: string,
  title: string,
  startTime: string,
  durationMinutes: number = 60,
  attendees?: string[]
): Promise<Meeting> {
  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const eventBody: any = {
    summary: title,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    conferenceData: {
      createRequest: {
        requestId: `siteguru-meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: {
          type: "hangoutsMeet",
        },
      },
    },
  };

  if (attendees && attendees.length > 0) {
    eventBody.attendees = attendees.map((email) => ({ email }));
  }

  const data = await meetFetch<any>(token, "calendars/primary/events", {
    method: "POST",
    params: { conferenceDataVersion: "1" },
    body: eventBody,
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const meeting = parseMeeting(data);
  if (!meeting) {
    // Fallback: conference may not be ready yet but event was created
    return {
      id: data.id || "",
      title: data.summary || title,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      meetLink: data.hangoutLink || "",
      htmlLink: data.htmlLink || "",
      attendees: [],
      entryPoints: [],
      status: data.status || "confirmed",
    };
  }

  return meeting;
}

/**
 * Fetch upcoming Calendar events that have Google Meet links.
 * Looks 14 days ahead for events with conferenceData.
 */
export async function fetchUpcomingMeetings(
  token: string
): Promise<{ meetings: Meeting[] }> {
  const now = new Date();
  const futureDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = await meetFetch<any>(token, "calendars/primary/events", {
    params: {
      timeMin: now.toISOString(),
      timeMax: futureDate.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
    },
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const items = data.items || [];
  const meetings: Meeting[] = [];

  for (const item of items) {
    const meeting = parseMeeting(item);
    if (meeting) meetings.push(meeting);
  }

  return { meetings };
}
