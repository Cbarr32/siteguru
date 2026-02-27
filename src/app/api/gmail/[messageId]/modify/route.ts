import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { modifyLabels, GmailApiError } from "@/lib/providers/gmail";

/**
 * PATCH /api/gmail/[messageId]/modify
 *
 * Modify labels on a Gmail message.
 *
 * Request body:
 *   - addLabelIds?: string[]
 *   - removeLabelIds?: string[]
 *
 * Common operations:
 *   - Mark as read:     { removeLabelIds: ["UNREAD"] }
 *   - Mark as unread:   { addLabelIds: ["UNREAD"] }
 *   - Star:             { addLabelIds: ["STARRED"] }
 *   - Unstar:           { removeLabelIds: ["STARRED"] }
 *   - Archive:          { removeLabelIds: ["INBOX"] }
 *   - Move to trash:    { addLabelIds: ["TRASH"] }
 */
export async function PATCH(
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

  let body: { addLabelIds?: string[]; removeLabelIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { addLabelIds = [], removeLabelIds = [] } = body;

  if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
    return NextResponse.json(
      { error: "At least one of addLabelIds or removeLabelIds is required" },
      { status: 400 }
    );
  }

  try {
    const message = await modifyLabels(
      session.accessToken,
      messageId,
      addLabelIds,
      removeLabelIds
    );

    return NextResponse.json(message);
  } catch (error) {
    if (error instanceof GmailApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Gmail modify error:", error);
    return NextResponse.json(
      { error: "Failed to modify message" },
      { status: 500 }
    );
  }
}
