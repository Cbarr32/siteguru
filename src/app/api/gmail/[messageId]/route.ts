import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchMessage, GmailApiError } from "@/lib/providers/gmail";

/**
 * GET /api/gmail/[messageId]
 *
 * Fetch a single Gmail message by ID with full body content.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Google to access Gmail." },
      { status: 401 }
    );
  }

  const { messageId } = await params;

  if (!messageId) {
    return NextResponse.json(
      { error: "Message ID is required" },
      { status: 400 }
    );
  }

  try {
    const message = await fetchMessage(session.accessToken, messageId);
    return NextResponse.json(message);
  } catch (error) {
    if (error instanceof GmailApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Gmail message error:", error);
    return NextResponse.json(
      { error: "Failed to fetch message" },
      { status: 500 }
    );
  }
}
