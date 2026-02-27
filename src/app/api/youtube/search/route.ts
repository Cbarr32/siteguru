import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { searchVideos, YouTubeApiError } from "@/lib/providers/youtube";

/**
 * GET /api/youtube/search?q=...&maxResults=12
 *
 * Search YouTube videos. Not cached — results change per query.
 */
export async function GET(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Google." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const maxResults = Math.min(
    parseInt(searchParams.get("maxResults") || "12", 10),
    50
  );

  if (!query) {
    return NextResponse.json(
      { error: "Missing required query parameter: q" },
      { status: 400 }
    );
  }

  try {
    const results = await searchVideos(session.accessToken, query, maxResults);
    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("YouTube search error:", error);
    return NextResponse.json(
      { error: "Failed to search YouTube" },
      { status: 500 }
    );
  }
}
