import { NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchAccountInfo, InstagramApiError } from "@/lib/providers/instagram";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/instagram/account
 *
 * Fetch Instagram Business/Creator account info.
 * Cached for 900 seconds (15 minutes).
 */
export async function GET() {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.instagramToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Facebook/Instagram." },
      { status: 401 }
    );
  }

  try {
    const cacheKey = `instagram:account:${session.user.id}`;
    const result = await cachedFetch(
      cacheKey,
      () => fetchAccountInfo(session.instagramToken!),
      900
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InstagramApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Instagram account error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Instagram account" },
      { status: 500 }
    );
  }
}
