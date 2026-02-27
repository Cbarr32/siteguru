import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchChats, TeamsApiError } from "@/lib/providers/teams";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/teams/chats
 *
 * Fetch recent Teams chats with last message preview.
 * Cached for 60 seconds.
 */
export async function GET(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.teamsToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Microsoft." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const maxResults = Math.min(
    parseInt(searchParams.get("maxResults") || "20", 10),
    50
  );

  try {
    const cacheKey = `teams:chats:${session.user.id}:${maxResults}`;
    const result = await cachedFetch(
      cacheKey,
      () => fetchChats(session.teamsToken!, maxResults),
      60
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TeamsApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Teams chats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chats" },
      { status: 500 }
    );
  }
}
