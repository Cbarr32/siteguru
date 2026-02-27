import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { addToQueue, SpotifyApiError } from "@/lib/providers/spotify";

/**
 * POST /api/spotify/queue
 *
 * Body: { trackUri: string }
 */
export async function POST(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.spotifyToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Spotify." },
      { status: 401 }
    );
  }

  let body: { trackUri?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.trackUri || !body.trackUri.startsWith("spotify:track:")) {
    return NextResponse.json(
      { error: "Invalid trackUri. Must be a Spotify track URI." },
      { status: 400 }
    );
  }

  try {
    await addToQueue(session.spotifyToken, body.trackUri);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Spotify queue error:", error);
    return NextResponse.json(
      { error: "Failed to add to queue" },
      { status: 500 }
    );
  }
}
