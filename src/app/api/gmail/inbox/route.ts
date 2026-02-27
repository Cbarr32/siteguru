import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchInbox, GmailApiError } from "@/lib/providers/gmail";

/**
 * GET /api/gmail/inbox
 *
 * Query params:
 *   - maxResults (default 20)
 *   - pageToken  (optional, for pagination)
 *   - q          (optional, Gmail search query)
 */
export async function GET(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Google to access Gmail." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const maxResults = Math.min(
    parseInt(searchParams.get("maxResults") || "20", 10),
    50
  );
  const pageToken = searchParams.get("pageToken") || undefined;
  const query = searchParams.get("q") || undefined;

  try {
    const inbox = await fetchInbox(
      session.accessToken,
      maxResults,
      pageToken,
      query
    );

    return NextResponse.json(inbox);
  } catch (error) {
    if (error instanceof GmailApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Gmail inbox error:", error);
    return NextResponse.json(
      { error: "Failed to fetch inbox" },
      { status: 500 }
    );
  }
}
