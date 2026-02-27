import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { sendChatMessage, TeamsApiError } from "@/lib/providers/teams";
import { z } from "zod/v4";

// ─── Zod schema for send message ────────────────────────────────

const sendMessageSchema = z.object({
  message: z.string().min(1, "Message is required"),
});

/**
 * POST /api/teams/chats/[chatId]/send
 *
 * Send a message to a Teams chat.
 */
export async function POST(
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const result = sendMessageSchema.safeParse(rawBody);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation error", issues: result.error.issues },
      { status: 400 }
    );
  }

  try {
    const message = await sendChatMessage(
      session.teamsToken,
      chatId,
      result.data.message
    );
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof TeamsApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Teams send message error:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
