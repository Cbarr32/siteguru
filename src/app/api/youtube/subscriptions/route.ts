import { NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchSubscriptionFeed, YouTubeApiError } from "@/lib/providers/youtube";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/youtube/subscriptions
 *
 * Fetch recent videos from user's subscriptions. Cached for 300s.
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
    const cacheKey = `youtube:subscriptions:${session.user.id}`;
    const feed = await cachedFetch(
      cacheKey,
      () => fetchSubscriptionFeed(session.accessToken!),
      300
    );

    return NextResponse.json(feed);
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("YouTube subscriptions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription feed" },
      { status: 500 }
    );
  }
}
