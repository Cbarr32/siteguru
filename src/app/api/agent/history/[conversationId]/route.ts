/**
 * /api/agent/history/[conversationId] — GET / DELETE
 * ───────────────────────────────────────────────────
 * GET    — Returns the full conversation with all messages.
 * DELETE — Removes the conversation and its messages.
 */

import { NextRequest } from "next/server";
import { auth, type SessionWithAccessToken } from "@/lib/auth";
import {
  getConversation,
  deleteConversation,
} from "@/lib/agent/conversation-store";

interface RouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function GET(
  _req: NextRequest,
  context: RouteContext
) {
  try {
    const session = (await auth()) as SessionWithAccessToken | null;
    if (!session?.user?.id) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { conversationId } = await context.params;
    const conversation = await getConversation(
      conversationId,
      session.user.id
    );

    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return Response.json({ conversation });
  } catch (err) {
    console.error("[agent/history/[id]] GET Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: RouteContext
) {
  try {
    const session = (await auth()) as SessionWithAccessToken | null;
    if (!session?.user?.id) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { conversationId } = await context.params;
    const deleted = await deleteConversation(conversationId, session.user.id);

    if (!deleted) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("[agent/history/[id]] DELETE Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
