import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { createMeetLink, MeetApiError } from "@/lib/providers/meet";
import { z } from "zod/v4";

// ─── Zod schema for meeting creation ────────────────────────────

const createMeetSchema = z.object({
  title: z.string().min(1, "Title is required"),
  startTime: z.string().min(1, "Start time is required"),
  durationMinutes: z.number().min(5).max(480).optional(),
  attendees: z.array(z.string().email()).optional(),
});

/**
 * POST /api/meet/create
 *
 * Create a Google Meet meeting via Calendar event with conferenceData.
 */
export async function POST(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Google." },
      { status: 401 }
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

  const result = createMeetSchema.safeParse(rawBody);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation error", issues: result.error.issues },
      { status: 400 }
    );
  }

  const { title, startTime, durationMinutes, attendees } = result.data;

  try {
    const meeting = await createMeetLink(
      session.accessToken,
      title,
      startTime,
      durationMinutes ?? 60,
      attendees
    );
    return NextResponse.json(meeting, { status: 201 });
  } catch (error) {
    if (error instanceof MeetApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Meet create error:", error);
    return NextResponse.json(
      { error: "Failed to create meeting" },
      { status: 500 }
    );
  }
}
