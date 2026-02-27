import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchEventDetail, CalendarApiError } from "@/lib/providers/calendar";

/**
 * GET /api/calendar/events/[eventId]
 *
 * Fetch a single event's details.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Google." },
      { status: 401 }
    );
  }

  const { eventId } = await params;

  if (!eventId) {
    return NextResponse.json(
      { error: "Missing event ID" },
      { status: 400 }
    );
  }

  try {
    const event = await fetchEventDetail(session.accessToken, eventId);
    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof CalendarApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Calendar event detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch event detail" },
      { status: 500 }
    );
  }
}
