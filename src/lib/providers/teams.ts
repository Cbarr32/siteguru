/**
 * Microsoft Teams Provider — Microsoft Graph API v1.0
 *
 * Wraps the Graph REST API for Teams chat, messaging, and presence.
 *
 * Uses the Microsoft Entra ID (Azure AD) access token scoped to:
 *   - Chat.Read / Chat.ReadWrite
 *   - ChannelMessage.Read.All
 *   - Presence.Read
 *   - User.Read
 */

const GRAPH_API = "https://graph.microsoft.com/v1.0";

// ─── Types ──────────────────────────────────────────────────────

export interface TeamsUser {
  id: string;
  displayName: string;
  email?: string;
  userPrincipalName?: string;
}

export interface TeamsChatMember {
  id: string;
  displayName: string;
  email?: string;
  userId?: string;
}

export interface TeamsChatMessage {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime?: string;
  body: {
    contentType: "text" | "html";
    content: string;
  };
  from?: {
    user?: {
      id: string;
      displayName: string;
      userIdentityType?: string;
    };
    application?: {
      id: string;
      displayName: string;
    };
  };
  messageType: string;
  importance: string;
  webUrl?: string;
  attachments?: {
    id: string;
    contentType: string;
    contentUrl?: string;
    name?: string;
  }[];
}

export interface TeamsChat {
  id: string;
  topic: string | null;
  chatType: "oneOnOne" | "group" | "meeting";
  createdDateTime: string;
  lastUpdatedDateTime: string;
  members?: TeamsChatMember[];
  lastMessagePreview?: {
    id: string;
    createdDateTime: string;
    isDeleted: boolean;
    body: {
      contentType: "text" | "html";
      content: string;
    };
    from?: {
      user?: {
        id: string;
        displayName: string;
      };
      application?: {
        id: string;
        displayName: string;
      };
    };
  };
  unreadMessageCount?: number;
}

export interface TeamsPresence {
  id: string;
  availability:
    | "Available"
    | "Busy"
    | "DoNotDisturb"
    | "Away"
    | "BeRightBack"
    | "Offline"
    | "PresenceUnknown";
  activity: string;
  statusMessage?: {
    message: {
      content: string;
      contentType: string;
    };
    expiryDateTime?: string;
  };
}

export interface GraphListResponse<T> {
  value: T[];
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
}

// ─── Error class ────────────────────────────────────────────────

export class TeamsApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "TeamsApiError";
  }
}

// ─── Internal fetch helper ──────────────────────────────────────

async function graphFetch<T>(
  token: string,
  path: string,
  options: {
    method?: string;
    params?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = "GET", params, body } = options;

  const url = new URL(`${GRAPH_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = `Graph API ${res.status}`;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      if (err.error?.message) msg = err.error.message;
    } catch {
      // ignore parse errors
    }
    throw new TeamsApiError(msg, res.status);
  }

  // 204 No Content
  if (res.status === 204) return {} as T;

  return (await res.json()) as T;
}

// ─── Exported functions ─────────────────────────────────────────

/**
 * Fetch recent chats with last message preview and members.
 */
export async function fetchChats(
  token: string,
  maxResults: number = 20
): Promise<{ chats: TeamsChat[] }> {
  const data = await graphFetch<GraphListResponse<TeamsChat>>(
    token,
    "/me/chats",
    {
      params: {
        $expand: "lastMessagePreview,members",
        $orderby: "lastUpdatedDateTime desc",
        $top: String(Math.min(maxResults, 50)),
      },
    }
  );

  return { chats: data.value ?? [] };
}

/**
 * Fetch messages in a specific chat.
 */
export async function fetchChatMessages(
  token: string,
  chatId: string,
  maxMessages: number = 30
): Promise<{ messages: TeamsChatMessage[] }> {
  const data = await graphFetch<GraphListResponse<TeamsChatMessage>>(
    token,
    `/me/chats/${encodeURIComponent(chatId)}/messages`,
    {
      params: {
        $top: String(Math.min(maxMessages, 50)),
        $orderby: "createdDateTime desc",
      },
    }
  );

  // Reverse so oldest messages are first (natural reading order)
  return { messages: (data.value ?? []).reverse() };
}

/**
 * Send a message to a chat.
 */
export async function sendChatMessage(
  token: string,
  chatId: string,
  message: string
): Promise<TeamsChatMessage> {
  return graphFetch<TeamsChatMessage>(
    token,
    `/me/chats/${encodeURIComponent(chatId)}/messages`,
    {
      method: "POST",
      body: {
        body: {
          contentType: "text",
          content: message,
        },
      },
    }
  );
}

/**
 * Fetch the current user's presence status.
 */
export async function fetchPresence(
  token: string
): Promise<TeamsPresence> {
  return graphFetch<TeamsPresence>(token, "/me/presence");
}
