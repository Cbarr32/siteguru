import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchActivity, GitHubApiError } from "@/lib/providers/github";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/github/activity
 *
 * Query params:
 *   - type (all | commits | prs | issues, default "all")
 *   - repo (optional, filter by repo full name)
 */
export async function GET(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.githubToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with GitHub to access activity." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") || "all") as
    | "all"
    | "commits"
    | "prs"
    | "issues";
  const repo = searchParams.get("repo") || undefined;

  try {
    const cacheKey = `github:activity:${session.user.id}:${type}:${repo || "all"}`;
    const activity = await cachedFetch(
      cacheKey,
      () => fetchActivity(session.githubToken!, type, repo),
      300
    );

    return NextResponse.json(activity);
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("GitHub activity error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
