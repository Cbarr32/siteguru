import { NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchPresence, TeamsApiError } from "@/lib/providers/teams";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/teams/presence
 *
 * Fetch the current user's Teams presence status.
 * Cached for 30 seconds.
 */
export async function GET() {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.teamsToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Microsoft." },
      { status: 401 }
    );
  }

  try {
    const cacheKey = `teams:presence:${session.user.id}`;
    const result = await cachedFetch(
      cacheKey,
      () => fetchPresence(session.teamsToken!),
      30
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TeamsApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Teams presence error:", error);
    return NextResponse.json(
      { error: "Failed to fetch presence" },
      { status: 500 }
    );
  }
}
