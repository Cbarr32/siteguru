/**
 * tools.ts
 * --------
 * Agent tool definitions in two formats:
 *   1. `agentTools`            — Anthropic tool_use format (name, description, input_schema)
 *   2. `agentToolsForVercelAI` — Vercel AI SDK tool() wrappers with Zod validation + execute fns
 *
 * Every tool delegates to the corresponding provider function with the
 * active session's access token.
 */

import { z } from "zod/v4";
import { tool } from "ai";

import { auth, type SessionWithAccessToken } from "@/lib/auth";

// ─── Provider imports ───────────────────────────────────────────
import {
  fetchInbox,
  fetchMessage,
  sendEmail,
} from "@/lib/providers/gmail";
import {
  fetchTodayEvents,
  fetchUpcomingEvents,
  createEvent,
} from "@/lib/providers/calendar";
import {
  fetchActivity,
  fetchNotifications,
  fetchRepos,
} from "@/lib/providers/github";
import {
  fetchNowPlaying,
  controlPlayback,
  searchSpotify,
  addToQueue,
} from "@/lib/providers/spotify";
import {
  fetchChats,
  fetchChatMessages,
  sendChatMessage,
} from "@/lib/providers/teams";
import { searchVideos } from "@/lib/providers/youtube";
import { createMeetLink } from "@/lib/providers/meet";
import { fetchAllFeeds } from "@/lib/providers/rss";
import { cachedFetch } from "@/lib/redis";

// ─── Session helper ─────────────────────────────────────────────

async function getSession(): Promise<SessionWithAccessToken> {
  const session = (await auth()) as SessionWithAccessToken | null;
  if (!session) throw new Error("Not authenticated");
  return session;
}

function requireToken(
  token: string | undefined,
  service: string
): string {
  if (!token) throw new Error(`${service} is not connected. Please sign in first.`);
  return token;
}

// ═══════════════════════════════════════════════════════════════════
// 1. Anthropic tool_use format
// ═══════════════════════════════════════════════════════════════════

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const agentTools: AnthropicTool[] = [
  // ── Gmail ───────────────────────────────────────────────────────
  {
    name: "gmail_search",
    description:
      "Search Gmail inbox. Returns a list of emails matching the query, or recent emails if no query is given. Includes sender, subject, snippet, read/unread status, and date.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Gmail search query (same syntax as the Gmail search bar). Examples: 'from:jane@acme.com', 'is:unread', 'subject:invoice'. Leave empty for recent inbox.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of emails to return (default: 20, max: 50).",
        },
      },
      required: [],
    },
  },
  {
    name: "gmail_read",
    description:
      "Read the full content of a specific email by its message ID. Returns the complete body, headers, and metadata.",
    input_schema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The Gmail message ID to read.",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_draft",
    description:
      "Compose an email draft. Returns a preview of the email for Barr to review before sending. Does NOT send — use gmail_send to actually send.",
    input_schema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address.",
        },
        subject: {
          type: "string",
          description: "Email subject line.",
        },
        body: {
          type: "string",
          description: "Email body (plain text).",
        },
        replyToMessageId: {
          type: "string",
          description:
            "If this is a reply, the message ID of the email being replied to.",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "gmail_send",
    description:
      "Send an email. Requires confirmation from Barr before executing. Supports new messages and replies.",
    input_schema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address.",
        },
        subject: {
          type: "string",
          description: "Email subject line.",
        },
        body: {
          type: "string",
          description: "Email body (plain text).",
        },
        replyToMessageId: {
          type: "string",
          description:
            "If this is a reply, the message ID of the email being replied to.",
        },
      },
      required: ["to", "subject", "body"],
    },
  },

  // ── Calendar ────────────────────────────────────────────────────
  {
    name: "calendar_list_events",
    description:
      "List calendar events. Can show today's events or upcoming events for the next N days. Returns event title, time, location, attendees, and meeting links.",
    input_schema: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["today", "upcoming"],
          description:
            "Which events to show: 'today' for today only, 'upcoming' for the next several days (default: 'today').",
        },
        daysAhead: {
          type: "number",
          description:
            "Number of days ahead to look when view is 'upcoming' (default: 7, max: 30).",
        },
      },
      required: [],
    },
  },
  {
    name: "calendar_create_event",
    description:
      "Create a new Google Calendar event. Requires confirmation from Barr before executing. Can optionally add a Google Meet link and invite attendees.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Event title/name.",
        },
        startTime: {
          type: "string",
          description: "Start time as ISO 8601 string (e.g. '2025-03-15T14:00:00').",
        },
        endTime: {
          type: "string",
          description: "End time as ISO 8601 string.",
        },
        description: {
          type: "string",
          description: "Optional event description or notes.",
        },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "List of attendee email addresses to invite.",
        },
        addMeetLink: {
          type: "boolean",
          description: "Whether to generate a Google Meet link for this event (default: false).",
        },
      },
      required: ["title", "startTime", "endTime"],
    },
  },

  // ── GitHub ──────────────────────────────────────────────────────
  {
    name: "github_activity",
    description:
      "Fetch recent GitHub activity (commits, PRs, issues, etc.) for the authenticated user. Optionally filter by event type or repository.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["all", "commits", "prs", "issues"],
          description: "Filter by event type (default: 'all').",
        },
        repo: {
          type: "string",
          description:
            "Filter by repository full name (e.g. 'Cbarr32/siteguru'). Optional.",
        },
      },
      required: [],
    },
  },
  {
    name: "github_notifications",
    description:
      "Fetch unread GitHub notifications including PR review requests, issue mentions, and CI statuses. Returns notification title, repo, reason, and type.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "github_repos",
    description:
      "List the authenticated user's GitHub repositories. Sortable by recently updated, stars, or last push.",
    input_schema: {
      type: "object",
      properties: {
        sort: {
          type: "string",
          enum: ["updated", "stars", "pushed"],
          description: "Sort order for repositories (default: 'updated').",
        },
      },
      required: [],
    },
  },

  // ── Spotify ─────────────────────────────────────────────────────
  {
    name: "spotify_now_playing",
    description:
      "Get the currently playing track on Spotify, including track name, artist, album, playback progress, device, and shuffle/repeat state.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "spotify_control",
    description:
      "Control Spotify playback: play, pause, skip to next/previous track, or toggle shuffle.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["play", "pause", "next", "previous", "shuffle_on", "shuffle_off"],
          description: "The playback action to perform.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "spotify_search",
    description:
      "Search Spotify for tracks, artists, albums, or playlists. Returns matching results with names, URIs, and images.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (artist name, track title, etc.).",
        },
        type: {
          type: "string",
          enum: ["track", "artist", "album", "playlist"],
          description: "Type of content to search for (default: 'track').",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "spotify_queue",
    description:
      "Add a track to the Spotify playback queue. Requires the Spotify track URI.",
    input_schema: {
      type: "object",
      properties: {
        trackUri: {
          type: "string",
          description:
            "Spotify track URI (e.g. 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh'). Get this from spotify_search results.",
        },
      },
      required: ["trackUri"],
    },
  },

  // ── Teams ───────────────────────────────────────────────────────
  {
    name: "teams_list_chats",
    description:
      "List recent Microsoft Teams chats with last message preview, unread counts, and member info.",
    input_schema: {
      type: "object",
      properties: {
        maxResults: {
          type: "number",
          description: "Maximum number of chats to return (default: 20, max: 50).",
        },
      },
      required: [],
    },
  },
  {
    name: "teams_read_chat",
    description:
      "Read messages from a specific Microsoft Teams chat by chat ID. Returns recent messages with sender and timestamps.",
    input_schema: {
      type: "object",
      properties: {
        chatId: {
          type: "string",
          description: "The Teams chat ID to read messages from.",
        },
        maxMessages: {
          type: "number",
          description: "Maximum number of messages to return (default: 30).",
        },
      },
      required: ["chatId"],
    },
  },
  {
    name: "teams_send_message",
    description:
      "Send a message in a Microsoft Teams chat. Requires confirmation from Barr before executing.",
    input_schema: {
      type: "object",
      properties: {
        chatId: {
          type: "string",
          description: "The Teams chat ID to send the message in.",
        },
        message: {
          type: "string",
          description: "Message text to send.",
        },
      },
      required: ["chatId", "message"],
    },
  },

  // ── YouTube ─────────────────────────────────────────────────────
  {
    name: "youtube_search",
    description:
      "Search YouTube for videos. Returns video titles, channel names, thumbnails, view counts, and links.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: 12).",
        },
      },
      required: ["query"],
    },
  },

  // ── Weather ─────────────────────────────────────────────────────
  {
    name: "weather_current",
    description:
      "Get current weather conditions and 5-day forecast for a city. Includes temperature, humidity, wind speed, and conditions.",
    input_schema: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City name (default: 'Minneapolis').",
        },
      },
      required: [],
    },
  },

  // ── Meet ────────────────────────────────────────────────────────
  {
    name: "meet_create",
    description:
      "Create a new Google Meet meeting link with an associated calendar event. Requires confirmation from Barr before executing.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Meeting title.",
        },
        startTime: {
          type: "string",
          description: "Start time as ISO 8601 string.",
        },
        durationMinutes: {
          type: "number",
          description: "Meeting duration in minutes (default: 60).",
        },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "Email addresses of attendees to invite.",
        },
      },
      required: ["title", "startTime"],
    },
  },

  // ── Cross-service search ────────────────────────────────────────
  {
    name: "search_all",
    description:
      "Search across all connected services at once (Gmail, GitHub, Spotify, YouTube, News). Returns combined results grouped by service. Useful for broad queries.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search term to look for across all services.",
        },
      },
      required: ["query"],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════
// 2. Vercel AI SDK tool() format
//
//    Using `import { z } from "zod/v4"` provides type-safe schemas
//    that work directly with the AI SDK's `tool()` function.
// ═══════════════════════════════════════════════════════════════════

// ─── Zod schemas ────────────────────────────────────────────────

const gmailSearchSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Gmail search query (same syntax as the Gmail search bar). Examples: 'from:jane@acme.com', 'is:unread', 'subject:invoice'. Leave empty for recent inbox."
    ),
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of emails to return (default: 20, max: 50)."),
});

const gmailReadSchema = z.object({
  messageId: z.string().describe("The Gmail message ID to read."),
});

const gmailComposeSchema = z.object({
  to: z.string().describe("Recipient email address."),
  subject: z.string().describe("Email subject line."),
  body: z.string().describe("Email body (plain text)."),
  replyToMessageId: z
    .string()
    .optional()
    .describe(
      "If this is a reply, the message ID of the email being replied to."
    ),
});

const calendarListSchema = z.object({
  view: z
    .enum(["today", "upcoming"])
    .optional()
    .describe(
      "Which events to show: 'today' for today only, 'upcoming' for the next several days (default: 'today')."
    ),
  daysAhead: z
    .number()
    .optional()
    .describe(
      "Number of days ahead to look when view is 'upcoming' (default: 7, max: 30)."
    ),
});

const calendarCreateSchema = z.object({
  title: z.string().describe("Event title/name."),
  startTime: z
    .string()
    .describe("Start time as ISO 8601 string (e.g. '2025-03-15T14:00:00')."),
  endTime: z.string().describe("End time as ISO 8601 string."),
  description: z
    .string()
    .optional()
    .describe("Optional event description or notes."),
  attendees: z
    .array(z.string())
    .optional()
    .describe("List of attendee email addresses to invite."),
  addMeetLink: z
    .boolean()
    .optional()
    .describe(
      "Whether to generate a Google Meet link for this event (default: false)."
    ),
});

const githubActivitySchema = z.object({
  type: z
    .enum(["all", "commits", "prs", "issues"])
    .optional()
    .describe("Filter by event type (default: 'all')."),
  repo: z
    .string()
    .optional()
    .describe(
      "Filter by repository full name (e.g. 'Cbarr32/siteguru'). Optional."
    ),
});

const emptySchema = z.object({});

const githubReposSchema = z.object({
  sort: z
    .enum(["updated", "stars", "pushed"])
    .optional()
    .describe("Sort order for repositories (default: 'updated')."),
});

const spotifyControlSchema = z.object({
  action: z
    .enum(["play", "pause", "next", "previous", "shuffle_on", "shuffle_off"])
    .describe("The playback action to perform."),
});

const spotifySearchSchema = z.object({
  query: z.string().describe("Search query (artist name, track title, etc.)."),
  type: z
    .enum(["track", "artist", "album", "playlist"])
    .optional()
    .describe("Type of content to search for (default: 'track')."),
});

const spotifyQueueSchema = z.object({
  trackUri: z
    .string()
    .describe(
      "Spotify track URI (e.g. 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh'). Get this from spotify_search results."
    ),
});

const teamsListSchema = z.object({
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of chats to return (default: 20, max: 50)."),
});

const teamsReadSchema = z.object({
  chatId: z.string().describe("The Teams chat ID to read messages from."),
  maxMessages: z
    .number()
    .optional()
    .describe("Maximum number of messages to return (default: 30)."),
});

const teamsSendSchema = z.object({
  chatId: z.string().describe("The Teams chat ID to send the message in."),
  message: z.string().describe("Message text to send."),
});

const youtubeSearchSchema = z.object({
  query: z.string().describe("Search query."),
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of results to return (default: 12)."),
});

const weatherSchema = z.object({
  city: z
    .string()
    .optional()
    .describe("City name (default: 'Minneapolis')."),
});

const meetCreateSchema = z.object({
  title: z.string().describe("Meeting title."),
  startTime: z.string().describe("Start time as ISO 8601 string."),
  durationMinutes: z
    .number()
    .optional()
    .describe("Meeting duration in minutes (default: 60)."),
  attendees: z
    .array(z.string())
    .optional()
    .describe("Email addresses of attendees to invite."),
});

const searchAllSchema = z.object({
  query: z
    .string()
    .describe("The search term to look for across all services."),
});

// ─── Tool definitions ───────────────────────────────────────────

export const agentToolsForVercelAI = {
  // ── Gmail ───────────────────────────────────────────────────────
  gmail_search: tool({
    description:
      "Search Gmail inbox. Returns a list of emails matching the query, or recent emails if no query is given. Includes sender, subject, snippet, read/unread status, and date.",
    inputSchema: gmailSearchSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.accessToken, "Gmail");
      const data = await fetchInbox(
        token,
        Math.min(input.maxResults ?? 20, 50),
        undefined,
        input.query
      );
      return {
        messages: data.messages.map((m) => ({
          id: m.id,
          from: m.from,
          subject: m.subject,
          snippet: m.snippet,
          date: m.date,
          isUnread: m.isUnread,
          isStarred: m.isStarred,
        })),
        resultSizeEstimate: data.resultSizeEstimate,
      };
    },
  }),

  gmail_read: tool({
    description:
      "Read the full content of a specific email by its message ID. Returns the complete body, headers, and metadata.",
    inputSchema: gmailReadSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.accessToken, "Gmail");
      return fetchMessage(token, input.messageId);
    },
  }),

  gmail_draft: tool({
    description:
      "Compose an email draft. Returns a preview of the email for Barr to review before sending. Does NOT send — use gmail_send to actually send.",
    inputSchema: gmailComposeSchema,
    execute: async (input) => {
      return {
        status: "draft",
        preview: {
          to: input.to,
          subject: input.subject,
          body: input.body,
          replyToMessageId: input.replyToMessageId,
        },
        message:
          "Draft composed. Say 'send it' or use gmail_send to deliver this email.",
      };
    },
  }),

  gmail_send: tool({
    description:
      "Send an email. Requires confirmation from Barr before executing. Supports new messages and replies.",
    inputSchema: gmailComposeSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.accessToken, "Gmail");
      const result = await sendEmail(
        token,
        input.to,
        input.subject,
        input.body,
        input.replyToMessageId
      );
      return {
        status: "sent",
        id: result.id,
        threadId: result.threadId,
        to: input.to,
        subject: input.subject,
      };
    },
  }),

  // ── Calendar ────────────────────────────────────────────────────
  calendar_list_events: tool({
    description:
      "List calendar events. Can show today's events or upcoming events for the next N days. Returns event title, time, location, attendees, and meeting links.",
    inputSchema: calendarListSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.accessToken, "Google Calendar");
      if (input.view === "upcoming") {
        return fetchUpcomingEvents(token, Math.min(input.daysAhead ?? 7, 30));
      }
      return fetchTodayEvents(token);
    },
  }),

  calendar_create_event: tool({
    description:
      "Create a new Google Calendar event. Requires confirmation from Barr before executing. Can optionally add a Google Meet link and invite attendees.",
    inputSchema: calendarCreateSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.accessToken, "Google Calendar");
      const event = await createEvent(token, {
        title: input.title,
        startTime: input.startTime,
        endTime: input.endTime,
        description: input.description,
        attendees: input.attendees,
        addMeetLink: input.addMeetLink,
      });
      return {
        status: "created",
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        htmlLink: event.htmlLink,
        hangoutLink: event.hangoutLink,
      };
    },
  }),

  // ── GitHub ──────────────────────────────────────────────────────
  github_activity: tool({
    description:
      "Fetch recent GitHub activity (commits, PRs, issues, etc.) for the authenticated user. Optionally filter by event type or repository.",
    inputSchema: githubActivitySchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.githubToken, "GitHub");
      const events = await fetchActivity(token, input.type ?? "all", input.repo);
      return { events: events.slice(0, 30) };
    },
  }),

  github_notifications: tool({
    description:
      "Fetch unread GitHub notifications including PR review requests, issue mentions, and CI statuses. Returns notification title, repo, reason, and type.",
    inputSchema: emptySchema,
    execute: async () => {
      const s = await getSession();
      const token = requireToken(s.githubToken, "GitHub");
      const notifications = await fetchNotifications(token);
      return { notifications };
    },
  }),

  github_repos: tool({
    description:
      "List the authenticated user's GitHub repositories. Sortable by recently updated, stars, or last push.",
    inputSchema: githubReposSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.githubToken, "GitHub");
      const repos = await fetchRepos(token, input.sort ?? "updated");
      return { repos };
    },
  }),

  // ── Spotify ─────────────────────────────────────────────────────
  spotify_now_playing: tool({
    description:
      "Get the currently playing track on Spotify, including track name, artist, album, playback progress, device, and shuffle/repeat state.",
    inputSchema: emptySchema,
    execute: async () => {
      const s = await getSession();
      const token = requireToken(s.spotifyToken, "Spotify");
      return fetchNowPlaying(token);
    },
  }),

  spotify_control: tool({
    description:
      "Control Spotify playback: play, pause, skip to next/previous track, or toggle shuffle.",
    inputSchema: spotifyControlSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.spotifyToken, "Spotify");
      await controlPlayback(token, input.action);
      return { status: "ok", action: input.action };
    },
  }),

  spotify_search: tool({
    description:
      "Search Spotify for tracks, artists, albums, or playlists. Returns matching results with names, URIs, and images.",
    inputSchema: spotifySearchSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.spotifyToken, "Spotify");
      return searchSpotify(token, input.query, input.type ?? "track");
    },
  }),

  spotify_queue: tool({
    description:
      "Add a track to the Spotify playback queue. Requires the Spotify track URI.",
    inputSchema: spotifyQueueSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.spotifyToken, "Spotify");
      await addToQueue(token, input.trackUri);
      return { status: "queued", trackUri: input.trackUri };
    },
  }),

  // ── Teams ───────────────────────────────────────────────────────
  teams_list_chats: tool({
    description:
      "List recent Microsoft Teams chats with last message preview, unread counts, and member info.",
    inputSchema: teamsListSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.teamsToken, "Microsoft Teams");
      return fetchChats(token, Math.min(input.maxResults ?? 20, 50));
    },
  }),

  teams_read_chat: tool({
    description:
      "Read messages from a specific Microsoft Teams chat by chat ID. Returns recent messages with sender and timestamps.",
    inputSchema: teamsReadSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.teamsToken, "Microsoft Teams");
      return fetchChatMessages(token, input.chatId, input.maxMessages ?? 30);
    },
  }),

  teams_send_message: tool({
    description:
      "Send a message in a Microsoft Teams chat. Requires confirmation from Barr before executing.",
    inputSchema: teamsSendSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.teamsToken, "Microsoft Teams");
      const result = await sendChatMessage(token, input.chatId, input.message);
      return { status: "sent", id: result.id, chatId: input.chatId };
    },
  }),

  // ── YouTube ─────────────────────────────────────────────────────
  youtube_search: tool({
    description:
      "Search YouTube for videos. Returns video titles, channel names, thumbnails, view counts, and links.",
    inputSchema: youtubeSearchSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.accessToken, "YouTube");
      return searchVideos(token, input.query, input.maxResults ?? 12);
    },
  }),

  // ── Weather ─────────────────────────────────────────────────────
  weather_current: tool({
    description:
      "Get current weather conditions and 5-day forecast for a city. Includes temperature, humidity, wind speed, and conditions.",
    inputSchema: weatherSchema,
    execute: async (input) => {
      const targetCity = input.city || process.env.DEFAULT_CITY || "Minneapolis";
      const apiKey = process.env.OPENWEATHER_API_KEY;

      if (!apiKey || apiKey === "your-openweather-api-key") {
        return { error: "Weather API key not configured." };
      }

      return cachedFetch(
        `weather:tool:${targetCity.toLowerCase()}`,
        async () => {
          const [currentRes, forecastRes] = await Promise.all([
            fetch(
              `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(targetCity)}&appid=${apiKey}&units=imperial`
            ),
            fetch(
              `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(targetCity)}&appid=${apiKey}&units=imperial`
            ),
          ]);

          if (!currentRes.ok) throw new Error(`Weather API ${currentRes.status}`);
          const current = await currentRes.json();

          let forecast: {
            date: string;
            tempMin: number;
            tempMax: number;
            main: string;
            description: string;
          }[] = [];

          if (forecastRes.ok) {
            const forecastData = await forecastRes.json();
            const dailyMap = new Map<string, (typeof forecastData.list)[0]>();
            for (const item of forecastData.list) {
              const date = new Date(item.dt * 1000).toLocaleDateString("en-US", {
                weekday: "short",
              });
              if (!dailyMap.has(date)) dailyMap.set(date, item);
            }
            forecast = Array.from(dailyMap.entries())
              .slice(0, 5)
              .map(([date, item]) => ({
                date,
                tempMin: Math.round(item.main.temp_min),
                tempMax: Math.round(item.main.temp_max),
                main: item.weather[0].main,
                description: item.weather[0].description,
              }));
          }

          return {
            location: `${current.name}, ${current.sys.country}`,
            temperature: Math.round(current.main.temp),
            feelsLike: Math.round(current.main.feels_like),
            humidity: current.main.humidity,
            windSpeed: Math.round(current.wind.speed),
            description: current.weather[0].description,
            main: current.weather[0].main,
            forecast,
          };
        },
        600
      );
    },
  }),

  // ── Meet ────────────────────────────────────────────────────────
  meet_create: tool({
    description:
      "Create a new Google Meet meeting link with an associated calendar event. Requires confirmation from Barr before executing.",
    inputSchema: meetCreateSchema,
    execute: async (input) => {
      const s = await getSession();
      const token = requireToken(s.accessToken, "Google Meet");
      const meeting = await createMeetLink(
        token,
        input.title,
        input.startTime,
        input.durationMinutes ?? 60,
        input.attendees
      );
      return {
        status: "created",
        id: meeting.id,
        title: meeting.title,
        meetLink: meeting.meetLink,
        htmlLink: meeting.htmlLink,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        attendees: meeting.attendees.map((a) => a.email),
      };
    },
  }),

  // ── Cross-service search ────────────────────────────────────────
  search_all: tool({
    description:
      "Search across all connected services at once (Gmail, GitHub, Spotify, YouTube, News). Returns combined results grouped by service. Useful for broad queries.",
    inputSchema: searchAllSchema,
    execute: async (input) => {
      const s = await getSession();
      const q = input.query;

      // Fire all searches in parallel — each wrapped in try/catch
      const results = await Promise.allSettled([
        // Gmail
        s.accessToken
          ? fetchInbox(s.accessToken, 5, undefined, q).then((d) => ({
              service: "gmail" as const,
              results: d.messages.map((m) => ({
                id: m.id,
                from: m.from,
                subject: m.subject,
                snippet: m.snippet,
                date: m.date,
              })),
            }))
          : Promise.resolve({ service: "gmail" as const, results: [] }),

        // GitHub repos
        s.githubToken
          ? fetchRepos(s.githubToken).then((repos) => ({
              service: "github" as const,
              results: repos
                .filter(
                  (r) =>
                    r.name.toLowerCase().includes(q.toLowerCase()) ||
                    r.description?.toLowerCase().includes(q.toLowerCase())
                )
                .slice(0, 5)
                .map((r) => ({
                  name: r.fullName,
                  description: r.description,
                  stars: r.stars,
                  url: r.url,
                })),
            }))
          : Promise.resolve({ service: "github" as const, results: [] }),

        // Spotify
        s.spotifyToken
          ? searchSpotify(s.spotifyToken, q, "track").then((d) => ({
              service: "spotify" as const,
              results: d.tracks.slice(0, 5).map((t) => ({
                name: t.name,
                artist: t.artists.map((a) => a.name).join(", "),
                uri: t.uri,
              })),
            }))
          : Promise.resolve({ service: "spotify" as const, results: [] }),

        // YouTube
        s.accessToken
          ? searchVideos(s.accessToken, q, 5).then((d) => ({
              service: "youtube" as const,
              results: d.videos.map((v) => ({
                id: v.id,
                title: v.title,
                channel: v.channelTitle,
                viewCount: v.viewCount,
              })),
            }))
          : Promise.resolve({ service: "youtube" as const, results: [] }),

        // News
        fetchAllFeeds().then((items) => ({
          service: "news" as const,
          results: items
            .filter(
              (i) =>
                i.title.toLowerCase().includes(q.toLowerCase()) ||
                i.description?.toLowerCase().includes(q.toLowerCase())
            )
            .slice(0, 5)
            .map((i) => ({
              title: i.title,
              source: i.source,
              link: i.link,
              pubDate: i.pubDate,
            })),
        })),
      ]);

      // Collect successful results
      const output: Record<string, unknown[]> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          output[result.value.service] = result.value.results;
        }
      }
      return { query: q, results: output };
    },
  }),
};
