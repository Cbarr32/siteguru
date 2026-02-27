/**
 * Gmail API Provider
 *
 * Wraps the Gmail REST API v1 for inbox fetching, message detail,
 * email sending, and label modification.
 *
 * Requires a valid OAuth2 access token scoped to:
 *   - https://www.googleapis.com/auth/gmail.readonly
 *   - https://www.googleapis.com/auth/gmail.send
 *   - https://www.googleapis.com/auth/gmail.modify
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// ─── Types ──────────────────────────────────────────────────────

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    size: number;
    data?: string; // base64url-encoded
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessageRaw {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  sizeEstimate: number;
  payload?: GmailMessagePart;
}

export interface GmailListResponse {
  messages: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

/** Parsed message for the frontend */
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;       // HTML or plain-text body
  bodyType: "html" | "plain";
  isUnread: boolean;
  isStarred: boolean;
}

/** Inbox page for the frontend */
export interface GmailInboxPage {
  messages: GmailMessage[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function base64urlDecode(data: string): string {
  // Gmail uses URL-safe base64 (no padding)
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function base64urlEncode(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const header = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? "";
}

/**
 * Extract the body from a potentially multipart message.
 * Prefers HTML, falls back to plain text.
 */
function extractBody(
  payload: GmailMessagePart | undefined
): { body: string; bodyType: "html" | "plain" } {
  if (!payload) return { body: "", bodyType: "plain" };

  // Simple single-part message
  if (!payload.parts && payload.body?.data) {
    const decoded = base64urlDecode(payload.body.data);
    const isHtml = payload.mimeType === "text/html";
    return { body: decoded, bodyType: isHtml ? "html" : "plain" };
  }

  // Multipart — search recursively
  if (payload.parts) {
    // First pass: look for text/html
    const htmlPart = findPart(payload.parts, "text/html");
    if (htmlPart?.body?.data) {
      return {
        body: base64urlDecode(htmlPart.body.data),
        bodyType: "html",
      };
    }
    // Second pass: look for text/plain
    const textPart = findPart(payload.parts, "text/plain");
    if (textPart?.body?.data) {
      return {
        body: base64urlDecode(textPart.body.data),
        bodyType: "plain",
      };
    }
  }

  return { body: "", bodyType: "plain" };
}

function findPart(
  parts: GmailMessagePart[],
  mimeType: string
): GmailMessagePart | undefined {
  for (const part of parts) {
    if (part.mimeType === mimeType) return part;
    if (part.parts) {
      const found = findPart(part.parts, mimeType);
      if (found) return found;
    }
  }
  return undefined;
}

function parseMessage(raw: GmailMessageRaw): GmailMessage {
  const headers = raw.payload?.headers;
  const { body, bodyType } = extractBody(raw.payload);

  return {
    id: raw.id,
    threadId: raw.threadId,
    labelIds: raw.labelIds || [],
    snippet: raw.snippet,
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date") || new Date(parseInt(raw.internalDate, 10)).toISOString(),
    body,
    bodyType,
    isUnread: (raw.labelIds || []).includes("UNREAD"),
    isStarred: (raw.labelIds || []).includes("STARRED"),
  };
}

// ─── API Functions ──────────────────────────────────────────────

async function gmailFetch(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(`${GMAIL_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new GmailApiError(
      error?.error?.message || `Gmail API error: ${res.status}`,
      res.status
    );
  }

  return res;
}

export class GmailApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
  }
}

/**
 * Fetch inbox messages (list + individual message detail).
 * @param accessToken OAuth2 access token
 * @param maxResults Number of messages to return (default 20)
 * @param pageToken Pagination token for next page
 * @param query Gmail search query (e.g. "is:unread", "from:john@example.com")
 */
export async function fetchInbox(
  accessToken: string,
  maxResults: number = 20,
  pageToken?: string,
  query?: string
): Promise<GmailInboxPage> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    labelIds: "INBOX",
  });
  if (pageToken) params.set("pageToken", pageToken);
  if (query) params.set("q", query);

  const listRes = await gmailFetch(
    `/messages?${params.toString()}`,
    accessToken
  );
  const listData: GmailListResponse = await listRes.json();

  if (!listData.messages || listData.messages.length === 0) {
    return {
      messages: [],
      nextPageToken: undefined,
      resultSizeEstimate: 0,
    };
  }

  // Fetch individual messages in parallel (metadata + body)
  const messagePromises = listData.messages.map(async (m) => {
    const msgRes = await gmailFetch(
      `/messages/${m.id}?format=full`,
      accessToken
    );
    const raw: GmailMessageRaw = await msgRes.json();
    return parseMessage(raw);
  });

  const messages = await Promise.all(messagePromises);

  return {
    messages,
    nextPageToken: listData.nextPageToken,
    resultSizeEstimate: listData.resultSizeEstimate,
  };
}

/**
 * Fetch a single message by ID.
 */
export async function fetchMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const res = await gmailFetch(
    `/messages/${messageId}?format=full`,
    accessToken
  );
  const raw: GmailMessageRaw = await res.json();
  return parseMessage(raw);
}

/**
 * Send an email via Gmail API.
 * Constructs an RFC 2822 message and sends as base64url-encoded raw.
 */
export async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  replyToMessageId?: string
): Promise<{ id: string; threadId: string }> {
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
  ];

  if (replyToMessageId) {
    // Fetch original message to get Message-ID and References headers
    const original = await gmailFetch(
      `/messages/${replyToMessageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
      accessToken
    );
    const originalData: GmailMessageRaw = await original.json();
    const origMessageId = getHeader(originalData.payload?.headers, "Message-ID");
    const origReferences = getHeader(originalData.payload?.headers, "References");

    if (origMessageId) {
      messageParts.push(`In-Reply-To: ${origMessageId}`);
      messageParts.push(
        `References: ${origReferences ? origReferences + " " : ""}${origMessageId}`
      );
    }
  }

  const rawMessage = [...messageParts, "", body].join("\r\n");
  const encodedMessage = base64urlEncode(rawMessage);

  const requestBody: Record<string, string> = { raw: encodedMessage };
  if (replyToMessageId) {
    // Get the threadId to keep reply in thread
    const origRes = await gmailFetch(
      `/messages/${replyToMessageId}?format=minimal`,
      accessToken
    );
    const origData = await origRes.json();
    if (origData.threadId) {
      requestBody.threadId = origData.threadId;
    }
  }

  const res = await gmailFetch("/messages/send", accessToken, {
    method: "POST",
    body: JSON.stringify(requestBody),
  });

  const data = await res.json();
  return { id: data.id, threadId: data.threadId };
}

/**
 * Modify labels on a message (e.g., mark as read/unread, star/unstar, archive).
 */
export async function modifyLabels(
  accessToken: string,
  messageId: string,
  addLabelIds: string[] = [],
  removeLabelIds: string[] = []
): Promise<GmailMessage> {
  const res = await gmailFetch(`/messages/${messageId}/modify`, accessToken, {
    method: "POST",
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });

  const raw: GmailMessageRaw = await res.json();
  return parseMessage(raw);
}
