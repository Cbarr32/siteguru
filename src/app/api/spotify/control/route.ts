import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { controlPlayback, SpotifyApiError } from "@/lib/providers/spotify";

const VALID_ACTIONS = [
  "play",
  "pause",
  "next",
  "previous",
  "shuffle_on",
  "shuffle_off",
] as const;

type PlaybackAction = (typeof VALID_ACTIONS)[number];

/**
 * POST /api/spotify/control
 *
 * Body: { action: 'play'|'pause'|'next'|'previous'|'shuffle_on'|'shuffle_off' }
 */
export async function POST(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.spotifyToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Spotify." },
      { status: 401 }
    );
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (
    !body.action ||
    !VALID_ACTIONS.includes(body.action as PlaybackAction)
  ) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    await controlPlayback(
      session.spotifyToken,
      body.action as PlaybackAction
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Spotify control error:", error);
    return NextResponse.json(
      { error: "Failed to control playback" },
      { status: 500 }
    );
  }
}
