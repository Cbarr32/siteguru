/**
 * tool-handlers.ts
 * ----------------
 * Execution layer that routes tool calls to the corresponding provider
 * functions. Each handler:
 *   1. Extracts the session + relevant OAuth token
 *   2. Calls the provider function
 *   3. Returns JSON.stringify of the result
 *
 * If a required token is missing the handler returns a JSON error string
 * instead of throwing so the agent can surface a friendly message.
 */

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
import { cachedFetch } from "@/lib/redis";

// ─── Helpers ────────────────────────────────────────────────────

async function getSession(): Promise<SessionWithAccessToken> {
  const session = (await auth()) as SessionWithAccessToken | null;
  if (!session) throw new Error("Not authenticated — please sign in.");
  return session;
}

function tokenFor(
  session: SessionWithAccessToken,
  provider: "google" | "github" | "spotify" | "teams"
): string | undefined {
  switch (provider) {
    case "google":
      return session.accessToken;
    case "github":
      return session.githubToken;
    case "spotify":
      return session.spotifyToken;
    case "teams":
      return session.teamsToken;
  }
}

function requireToken(
  session: SessionWithAccessToken,
  provider: "google" | "github" | "spotify" | "teams",
  serviceName: string
): string {
  const token = tokenFor(session, provider);
  if (!token) {
    throw new ServiceNotConnectedError(serviceName);
  }
  return token;
}

class ServiceNotConnectedError extends Error {
  constructor(service: string) {
    super(`${service} is not connected. Please sign in with ${service} first.`);
    this.name = "ServiceNotConnectedError";
  }
}

/** Convenience: return an error JSON string for the agent. */
function errJson(message: string): string {
  return JSON.stringify({ error: message });
}

// ─── Input helpers (safely coerce untyped tool input) ───────────

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function strArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

// ═══════════════════════════════════════════════════════════════════
// Main dispatcher
// ═══════════════════════════════════════════════════════════════════

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  try {
    const session = await getSession();

    switch (toolName) {
      // ── Gmail ─────────────────────────────────────────────────
      case "gmail_search": {
        const token = requireToken(session, "google", "Gmail");
        const result = await fetchInbox(
          token,
          Math.min(num(toolInput.maxResults, 20), 50),
          undefined,
          optStr(toolInput.query)
        );
        return JSON.stringify({
          messages: result.messages.map((m) => ({
            id: m.id,
            from: m.from,
            subject: m.subject,
            snippet: m.snippet,
            date: m.date,
            isUnread: m.isUnread,
            isStarred: m.isStarred,
          })),
          resultSizeEstimate: result.resultSizeEstimate,
        });
      }

      case "gmail_read": {
        const token = requireToken(session, "google", "Gmail");
        const result = await fetchMessage(token, str(toolInput.messageId));
        return JSON.stringify(result);
      }

      case "gmail_draft": {
        // Draft only — return a preview, do NOT send.
        return JSON.stringify({
          status: "draft",
          preview: {
            to: str(toolInput.to),
            subject: str(toolInput.subject),
            body: str(toolInput.body),
            replyToMessageId: optStr(toolInput.replyToMessageId),
          },
          message:
            "Draft composed. Say 'send it' or use gmail_send to deliver this email.",
        });
      }

      case "gmail_send": {
        const token = requireToken(session, "google", "Gmail");
        const result = await sendEmail(
          token,
          str(toolInput.to),
          str(toolInput.subject),
          str(toolInput.body),
          optStr(toolInput.replyToMessageId)
        );
        return JSON.stringify({
          status: "sent",
          id: result.id,
          threadId: result.threadId,
          to: str(toolInput.to),
          subject: str(toolInput.subject),
        });
      }

      // ── Calendar ──────────────────────────────────────────────
      case "calendar_list_events": {
        const token = requireToken(session, "google", "Google Calendar");
        const view = str(toolInput.view, "today");
        if (view === "upcoming") {
          const result = await fetchUpcomingEvents(
            token,
            Math.min(num(toolInput.daysAhead, 7), 30)
          );
          return JSON.stringify(result);
        }
        const result = await fetchTodayEvents(token);
        return JSON.stringify(result);
      }

      case "calendar_create_event": {
        const token = requireToken(session, "google", "Google Calendar");
        const event = await createEvent(token, {
          title: str(toolInput.title),
          startTime: str(toolInput.startTime),
          endTime: str(toolInput.endTime),
          description: optStr(toolInput.description),
          attendees: strArr(toolInput.attendees),
          addMeetLink: bool(toolInput.addMeetLink),
        });
        return JSON.stringify({
          status: "created",
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
          htmlLink: event.htmlLink,
          hangoutLink: event.hangoutLink,
        });
      }

      // ── GitHub ────────────────────────────────────────────────
      case "github_activity": {
        const token = requireToken(session, "github", "GitHub");
        const type = (str(toolInput.type, "all") as "all" | "commits" | "prs" | "issues");
        const events = await fetchActivity(token, type, optStr(toolInput.repo));
        return JSON.stringify({ events: events.slice(0, 30) });
      }

      case "github_notifications": {
        const token = requireToken(session, "github", "GitHub");
        const notifications = await fetchNotifications(token);
        return JSON.stringify({ notifications });
      }

      case "github_repos": {
        const token = requireToken(session, "github", "GitHub");
        const sort = (str(toolInput.sort, "updated") as "updated" | "stars" | "pushed");
        const repos = await fetchRepos(token, sort);
        return JSON.stringify({ repos });
      }

      // ── Spotify ───────────────────────────────────────────────
      case "spotify_now_playing": {
        const token = requireToken(session, "spotify", "Spotify");
        const result = await fetchNowPlaying(token);
        return JSON.stringify(result);
      }

      case "spotify_control": {
        const token = requireToken(session, "spotify", "Spotify");
        const action = str(toolInput.action) as
          | "play"
          | "pause"
          | "next"
          | "previous"
          | "shuffle_on"
          | "shuffle_off";
        await controlPlayback(token, action);
        return JSON.stringify({ status: "ok", action });
      }

      case "spotify_search": {
        const token = requireToken(session, "spotify", "Spotify");
        const type = (str(toolInput.type, "track") as "track" | "artist" | "album" | "playlist");
        const result = await searchSpotify(
          token,
          str(toolInput.query),
          type
        );
        return JSON.stringify(result);
      }

      case "spotify_queue": {
        const token = requireToken(session, "spotify", "Spotify");
        await addToQueue(token, str(toolInput.trackUri));
        return JSON.stringify({
          status: "queued",
          trackUri: str(toolInput.trackUri),
        });
      }

      // ── Teams ─────────────────────────────────────────────────
      case "teams_list_chats": {
        const token = requireToken(session, "teams", "Microsoft Teams");
        const result = await fetchChats(
          token,
          Math.min(num(toolInput.maxResults, 20), 50)
        );
        return JSON.stringify(result);
      }

      case "teams_read_chat": {
        const token = requireToken(session, "teams", "Microsoft Teams");
        const result = await fetchChatMessages(
          token,
          str(toolInput.chatId),
          num(toolInput.maxMessages, 30)
        );
        return JSON.stringify(result);
      }

      case "teams_send_message": {
        const token = requireToken(session, "teams", "Microsoft Teams");
        const result = await sendChatMessage(
          token,
          str(toolInput.chatId),
          str(toolInput.message)
        );
        return JSON.stringify({
          status: "sent",
          id: result.id,
          chatId: str(toolInput.chatId),
        });
      }

      // ── YouTube ───────────────────────────────────────────────
      case "youtube_search": {
        const token = requireToken(session, "google", "YouTube");
        const result = await searchVideos(
          token,
          str(toolInput.query),
          num(toolInput.maxResults, 12)
        );
        return JSON.stringify(result);
      }

      // ── Weather ───────────────────────────────────────────────
      case "weather_current": {
        const targetCity =
          optStr(toolInput.city) || process.env.DEFAULT_CITY || "Minneapolis";
        const apiKey = process.env.OPENWEATHER_API_KEY;

        if (!apiKey || apiKey === "your-openweather-api-key") {
          return errJson("Weather API key not configured.");
        }

        const result = await cachedFetch(
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

            if (!currentRes.ok)
              throw new Error(`Weather API error: ${currentRes.status}`);
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
              const dailyMap = new Map<
                string,
                (typeof forecastData.list)[0]
              >();
              for (const item of forecastData.list) {
                const date = new Date(
                  item.dt * 1000
                ).toLocaleDateString("en-US", { weekday: "short" });
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
        return JSON.stringify(result);
      }

      // ── Meet ──────────────────────────────────────────────────
      case "meet_create": {
        const token = requireToken(session, "google", "Google Meet");
        const meeting = await createMeetLink(
          token,
          str(toolInput.title),
          str(toolInput.startTime),
          num(toolInput.durationMinutes, 60),
          strArr(toolInput.attendees)
        );
        return JSON.stringify({
          status: "created",
          id: meeting.id,
          title: meeting.title,
          meetLink: meeting.meetLink,
          htmlLink: meeting.htmlLink,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          attendees: meeting.attendees.map((a) => a.email),
        });
      }

      // ── Cross-service search ──────────────────────────────────
      case "search_all": {
        const q = str(toolInput.query);
        if (!q) return errJson("A search query is required.");

        const results = await Promise.allSettled([
          // Gmail
          tokenFor(session, "google")
            ? fetchInbox(tokenFor(session, "google")!, 5, undefined, q).then(
                (d) => ({
                  service: "gmail" as const,
                  results: d.messages.map((m) => ({
                    id: m.id,
                    from: m.from,
                    subject: m.subject,
                    snippet: m.snippet,
                    date: m.date,
                  })),
                })
              )
            : Promise.resolve({ service: "gmail" as const, results: [] }),

          // Calendar (today + upcoming)
          tokenFor(session, "google")
            ? fetchUpcomingEvents(tokenFor(session, "google")!, 7).then(
                (d) => ({
                  service: "calendar" as const,
                  results: d.events
                    .filter(
                      (e) =>
                        e.summary.toLowerCase().includes(q.toLowerCase()) ||
                        e.description
                          ?.toLowerCase()
                          .includes(q.toLowerCase())
                    )
                    .slice(0, 5)
                    .map((e) => ({
                      id: e.id,
                      summary: e.summary,
                      start: e.start,
                      end: e.end,
                      htmlLink: e.htmlLink,
                    })),
                })
              )
            : Promise.resolve({ service: "calendar" as const, results: [] }),

          // Teams
          tokenFor(session, "teams")
            ? fetchChats(tokenFor(session, "teams")!, 10).then((d) => ({
                service: "teams" as const,
                results: d.chats
                  .filter(
                    (c) =>
                      c.topic?.toLowerCase().includes(q.toLowerCase()) ||
                      c.lastMessagePreview?.body.content
                        ?.toLowerCase()
                        .includes(q.toLowerCase())
                  )
                  .slice(0, 5)
                  .map((c) => ({
                    id: c.id,
                    topic: c.topic,
                    lastMessage: c.lastMessagePreview?.body.content,
                  })),
              }))
            : Promise.resolve({ service: "teams" as const, results: [] }),

          // GitHub notifications
          tokenFor(session, "github")
            ? fetchNotifications(tokenFor(session, "github")!).then((n) => ({
                service: "github" as const,
                results: n
                  .filter(
                    (x) =>
                      x.title.toLowerCase().includes(q.toLowerCase()) ||
                      x.repo.toLowerCase().includes(q.toLowerCase())
                  )
                  .slice(0, 5)
                  .map((x) => ({
                    id: x.id,
                    title: x.title,
                    repo: x.repo,
                    reason: x.reason,
                    type: x.type,
                  })),
              }))
            : Promise.resolve({ service: "github" as const, results: [] }),
        ]);

        const output: Record<string, unknown[]> = {};
        for (const result of results) {
          if (result.status === "fulfilled") {
            output[result.value.service] = result.value.results;
          }
        }
        return JSON.stringify({ query: q, results: output });
      }

      // ── Unknown tool ──────────────────────────────────────────
      default:
        return errJson(`Unknown tool: ${toolName}`);
    }
  } catch (err) {
    if (err instanceof ServiceNotConnectedError) {
      return errJson(err.message);
    }
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return errJson(message);
  }
}
