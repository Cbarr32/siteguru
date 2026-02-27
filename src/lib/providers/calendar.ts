/**
 * Google Calendar API v3 Provider
 *
 * Wraps the Google Calendar REST API for event fetching, detail,
 * and event creation with optional Google Meet links.
 *
 * Uses the shared Google OAuth2 access token scoped to:
 *   - https://www.googleapis.com/auth/calendar.readonly
 *   - https://www.googleapis.com/auth/calendar.events
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// ─── Types ──────────────────────────────────────────────────────

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus: "needsAction" | "declined" | "tentative" | "accepted";
  self?: boolean;
  organizer?: boolean;
}

export interface CalendarEventTime {
  dateTime?: string; // RFC 3339
  date?: string; // YYYY-MM-DD (all-day events)
  timeZone?: string;
}

export interface ConferenceData {
  entryPoints?: {
    entryPointType: string;
    uri: string;
    label?: string;
  }[];
  conferenceSolution?: {
    name: string;
    iconUri?: string;
    key: { type: string };
  };
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
  status: string;
  htmlLink: string;
  hangoutLink?: string;
  conferenceData?: ConferenceData;
  attendees?: CalendarAttendee[];
  creator?: { email: string; displayName?: string; self?: boolean };
  organizer?: { email: string; displayName?: string; self?: boolean };
  colorId?: string;
  recurringEventId?: string;
  created: string;
  updated: string;
}

export interface CalendarEventList {
  events: CalendarEvent[];
  nextPageToken?: string;
}

export interface CreateEventInput {
  title: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  description?: string;
  attendees?: string[]; // email addresses
  addMeetLink?: boolean;
}

// ─── Errors ─────────────────────────────────────────────────────

export class CalendarApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "CalendarApiError";
  }
}

// ─── Helper ─────────────────────────────────────────────────────

async function calFetch<T>(
  token: string,
  endpoint: string,
  options: {
    method?: string;
    params?: Record<string, string>;
    body?: unknown;
    conferenceDataVersion?: number;
  } = {}
): Promise<T> {
  const { method = "GET", params = {}, body, conferenceDataVersion } = options;

  const url = new URL(`${CALENDAR_API}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (conferenceDataVersion != null) {
    url.searchParams.set(
      "conferenceDataVersion",
      String(conferenceDataVersion)
    );
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
    let message = `Calendar API error: ${res.status}`;
    try {
      const errBody = await res.json();
      message = errBody?.error?.message || message;
    } catch {
      // ignore parse errors
    }
    throw new CalendarApiError(message, res.status);
  }

  return (await res.json()) as T;
}

// ─── Parse helpers ──────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseEvent(item: any): CalendarEvent {
  return {
    id: item.id || "",
    summary: item.summary || "(No title)",
    description: item.description || undefined,
    location: item.location || undefined,
    start: item.start || {},
    end: item.end || {},
    status: item.status || "confirmed",
    htmlLink: item.htmlLink || "",
    hangoutLink: item.hangoutLink || undefined,
    conferenceData: item.conferenceData || undefined,
    attendees: (item.attendees || []).map((a: any) => ({
      email: a.email || "",
      displayName: a.displayName || undefined,
      responseStatus: a.responseStatus || "needsAction",
      self: a.self || false,
      organizer: a.organizer || false,
    })),
    creator: item.creator || undefined,
    organizer: item.organizer || undefined,
    colorId: item.colorId || undefined,
    recurringEventId: item.recurringEventId || undefined,
    created: item.created || "",
    updated: item.updated || "",
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Public API ─────────────────────────────────────────────────

/**
 * Fetch today's events from the user's primary calendar.
 */
export async function fetchTodayEvents(
  token: string
): Promise<CalendarEventList> {
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = await calFetch<any>(token, "calendars/primary/events", {
    params: {
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
    },
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    events: (data.items || []).map(parseEvent),
    nextPageToken: data.nextPageToken || undefined,
  };
}

/**
 * Fetch upcoming events for the next N days.
 */
export async function fetchUpcomingEvents(
  token: string,
  daysAhead: number = 7
): Promise<CalendarEventList> {
  const now = new Date();
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = await calFetch<any>(token, "calendars/primary/events", {
    params: {
      timeMin: now.toISOString(),
      timeMax: futureDate.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
    },
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    events: (data.items || []).map(parseEvent),
    nextPageToken: data.nextPageToken || undefined,
  };
}

/**
 * Create a new event on the user's primary calendar.
 * Optionally adds a Google Meet link via conferenceData.
 */
export async function createEvent(
  token: string,
  input: CreateEventInput
): Promise<CalendarEvent> {
  const { title, startTime, endTime, description, attendees, addMeetLink } =
    input;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const eventBody: any = {
    summary: title,
    start: { dateTime: startTime },
    end: { dateTime: endTime },
  };

  if (description) {
    eventBody.description = description;
  }

  if (attendees && attendees.length > 0) {
    eventBody.attendees = attendees.map((email) => ({ email }));
  }

  if (addMeetLink) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `siteguru-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: {
          type: "hangoutsMeet",
        },
      },
    };
  }

  const data = await calFetch<any>(token, "calendars/primary/events", {
    method: "POST",
    body: eventBody,
    conferenceDataVersion: addMeetLink ? 1 : undefined,
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return parseEvent(data);
}

/**
 * Fetch a single event's details.
 */
export async function fetchEventDetail(
  token: string,
  eventId: string
): Promise<CalendarEvent> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = await calFetch<any>(
    token,
    `calendars/primary/events/${encodeURIComponent(eventId)}`
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return parseEvent(data);
}
