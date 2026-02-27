import { NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchPlaylists, YouTubeApiError } from "@/lib/providers/youtube";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/youtube/playlists
 *
 * Fetch user's YouTube playlists. Cached for 300s.
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
    const cacheKey = `youtube:playlists:${session.user.id}`;
    const playlists = await cachedFetch(
      cacheKey,
      () => fetchPlaylists(session.accessToken!),
      300
    );

    return NextResponse.json(playlists);
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("YouTube playlists error:", error);
    return NextResponse.json(
      { error: "Failed to fetch playlists" },
      { status: 500 }
    );
  }
}
