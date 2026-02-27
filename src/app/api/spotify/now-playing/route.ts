import { NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchNowPlaying, SpotifyApiError } from "@/lib/providers/spotify";

/**
 * GET /api/spotify/now-playing
 *
 * Real-time — NO caching.
 */
export async function GET() {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.spotifyToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Spotify." },
      { status: 401 }
    );
  }

  try {
    const state = await fetchNowPlaying(session.spotifyToken);
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Spotify now-playing error:", error);
    return NextResponse.json(
      { error: "Failed to fetch now playing" },
      { status: 500 }
    );
  }
}
