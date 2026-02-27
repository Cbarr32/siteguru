import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { fetchChatMessages, TeamsApiError } from "@/lib/providers/teams";

/**
 * GET /api/teams/chats/[chatId]/messages
 *
 * Fetch messages in a specific Teams chat.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.teamsToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Microsoft." },
      { status: 401 }
    );
  }

  const { chatId } = await params;

  if (!chatId) {
    return NextResponse.json(
      { error: "Missing chat ID" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const maxMessages = Math.min(
    parseInt(searchParams.get("maxMessages") || "30", 10),
    50
  );

  try {
    const result = await fetchChatMessages(
      session.teamsToken,
      chatId,
      maxMessages
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TeamsApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Teams chat messages error:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
