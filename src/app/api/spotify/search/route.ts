import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { searchSpotify, SpotifyApiError } from "@/lib/providers/spotify";

/**
 * GET /api/spotify/search
 *
 * Query params:
 *   - q (required): search query
 *   - type (optional): track | artist | album | playlist (default: track)
 */
export async function GET(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.spotifyToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Spotify." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const type = (searchParams.get("type") || "track") as
    | "track"
    | "artist"
    | "album"
    | "playlist";

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  try {
    const results = await searchSpotify(session.spotifyToken, query, type);
    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Spotify search error:", error);
    return NextResponse.json(
      { error: "Failed to search Spotify" },
      { status: 500 }
    );
  }
}
