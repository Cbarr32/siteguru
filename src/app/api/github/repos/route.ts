import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchRepos, GitHubApiError } from "@/lib/providers/github";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/github/repos
 *
 * Query params:
 *   - sort (updated | stars | pushed, default "updated")
 */
export async function GET(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.githubToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with GitHub to access repos." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const sort = (searchParams.get("sort") || "updated") as
    | "updated"
    | "stars"
    | "pushed";

  try {
    const cacheKey = `github:repos:${session.user.id}:${sort}`;
    const repos = await cachedFetch(
      cacheKey,
      () => fetchRepos(session.githubToken!, sort),
      300
    );

    return NextResponse.json(repos);
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("GitHub repos error:", error);
    return NextResponse.json(
      { error: "Failed to fetch repos" },
      { status: 500 }
    );
  }
}
