import { NextRequest, NextResponse } from "next/server";
import { auth, SessionWithAccessToken } from "@/lib/auth";
import { sendEmail, GmailApiError } from "@/lib/providers/gmail";
import { z } from "zod/v4";

const sendEmailSchema = z.object({
  to: z.email("Invalid email address"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  replyToMessageId: z.string().optional(),
});

/**
 * POST /api/gmail/send
 *
 * Send an email via Gmail. Body is validated with Zod.
 *
 * Request body:
 *   - to: string (email address)
 *   - subject: string
 *   - body: string (HTML content)
 *   - replyToMessageId?: string (optional, for replies)
 */
export async function POST(request: NextRequest) {
  const session = (await auth()) as SessionWithAccessToken | null;

  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in with Google to access Gmail." },
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

  const result = sendEmailSchema.safeParse(rawBody);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation error", issues: result.error.issues },
      { status: 400 }
    );
  }

  const { to, subject, body, replyToMessageId } = result.data;

  try {
    const sent = await sendEmail(
      session.accessToken,
      to,
      subject,
      body,
      replyToMessageId
    );

    return NextResponse.json(sent, { status: 201 });
  } catch (error) {
    if (error instanceof GmailApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Gmail send error:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
