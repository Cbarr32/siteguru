/**
 * /api/agent/history — GET
 * ────────────────────────
 * Returns the authenticated user's conversation list
 * ordered by most recently updated first.
 *
 * Query params:
 *   ?limit=50  — max conversations to return (1–200, default 50)
 */

import { NextRequest } from "next/server";
import { auth, type SessionWithAccessToken } from "@/lib/auth";
import { listConversations } from "@/lib/agent/conversation-store";

export async function GET(req: NextRequest) {
  try {
    const session = (await auth()) as SessionWithAccessToken | null;
    if (!session?.user?.id) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(
      Math.max(parseInt(limitParam ?? "50", 10) || 50, 1),
      200
    );

    const conversations = await listConversations(session.user.id, limit);

    return Response.json({ conversations });
  } catch (err) {
    console.error("[agent/history] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
