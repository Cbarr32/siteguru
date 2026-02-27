import { NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import {
  fetchContributionGraph,
  fetchProfile,
  GitHubApiError,
} from "@/lib/providers/github";
import { cachedFetch } from "@/lib/redis";

/**
 * GET /api/github/contributions
 *
 * Fetch contribution calendar (green squares) via GitHub GraphQL.
 * Also returns the profile for convenience (username, avatar).
 * Cached for 300s.
 */
export async function GET() {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.githubToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with GitHub to view contributions." },
      { status: 401 }
    );
  }

  try {
    const cacheKey = `github:contributions:${session.user.id}`;
    const data = await cachedFetch(
      cacheKey,
      async () => {
        const profile = await fetchProfile(session.githubToken!);
        const calendar = await fetchContributionGraph(
          session.githubToken!,
          profile.login
        );
        return { profile, calendar };
      },
      300
    );

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("GitHub contributions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch contributions" },
      { status: 500 }
    );
  }
}
