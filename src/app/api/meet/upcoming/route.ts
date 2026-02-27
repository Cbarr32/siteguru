import { NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchUpcomingMeetings, MeetApiError } from "@/lib/providers/meet";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/meet/upcoming
 *
 * Fetch upcoming meetings that have Google Meet links.
 * Cached for 120 seconds.
 */
export async function GET() {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Google." },
      { status: 401 }
    );
  }

  try {
    const cacheKey = `meet:upcoming:${session.user.id}`;
    const result = await cachedFetch(
      cacheKey,
      () => fetchUpcomingMeetings(session.accessToken!),
      120
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MeetApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Meet upcoming error:", error);
    return NextResponse.json(
      { error: "Failed to fetch upcoming meetings" },
      { status: 500 }
    );
  }
}
