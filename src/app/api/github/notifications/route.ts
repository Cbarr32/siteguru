import { NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchNotifications, GitHubApiError } from "@/lib/providers/github";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/github/notifications
 *
 * Fetch unread GitHub notifications. Cached for 60s.
 */
export async function GET() {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.githubToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with GitHub to access notifications." },
      { status: 401 }
    );
  }

  try {
    const cacheKey = `github:notifications:${session.user.id}`;
    const notifications = await cachedFetch(
      cacheKey,
      () => fetchNotifications(session.githubToken!),
      60
    );

    return NextResponse.json(notifications);
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("GitHub notifications error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
