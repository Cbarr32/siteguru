import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import {
  fetchUpcomingEvents,
  createEvent,
  CalendarApiError,
} from "@/lib/providers/calendar";
import { cachedFetch } from "@/lib/redis";
import { z } from "zod/v4";

// ─── Zod schema for event creation ─────────────────────────────

const createEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  description: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  addMeetLink: z.boolean().optional(),
});

// ─── GET /api/calendar/events?daysAhead=7 ───────────────────────

export async function GET(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Google." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const daysAhead = Math.min(
    parseInt(searchParams.get("daysAhead") || "7", 10),
    30
  );

  try {
    const cacheKey = `calendar:events:${session.user.id}:${daysAhead}`;
    const result = await cachedFetch(
      cacheKey,
      () => fetchUpcomingEvents(session.accessToken!, daysAhead),
      120
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CalendarApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Calendar events error:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}

// ─── POST /api/calendar/events ──────────────────────────────────

export async function POST(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Google." },
      { status: 401 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const result = createEventSchema.safeParse(rawBody);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation error", issues: result.error.issues },
      { status: 400 }
    );
  }

  try {
    const event = await createEvent(session.accessToken, result.data);
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof CalendarApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Calendar create event error:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}
