import { NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchPlaylists, SpotifyApiError } from "@/lib/providers/spotify";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/spotify/playlists
 *
 * Cached for 300s.
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
    const cacheKey = `spotify:playlists:${session.user.id}`;
    const playlists = await cachedFetch(
      cacheKey,
      () => fetchPlaylists(session.spotifyToken!),
      300
    );

    return NextResponse.json(playlists);
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Spotify playlists error:", error);
    return NextResponse.json(
      { error: "Failed to fetch playlists" },
      { status: 500 }
    );
  }
}
