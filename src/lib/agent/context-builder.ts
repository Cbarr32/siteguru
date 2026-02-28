/**
 * context-builder.ts
 * ------------------
 * Gathers lightweight, real-time summaries from every connected
 * service and returns a typed LiveContext object for the system prompt.
 *
 * Every service fetch is individually wrapped in a 2-second timeout
 * so that a single slow provider never blocks the agent.
 */

import { auth, type SessionWithAccessToken } from "@/lib/auth";
import { cachedFetch } from "@/lib/redis";

// ─── Provider imports ──────────────────────────────────────────
import { fetchInbox } from "@/lib/providers/gmail";
import {
  fetchNotifications,
  fetchProfile,
} from "@/lib/providers/github";
import { fetchNowPlaying } from "@/lib/providers/spotify";
import { fetchTodayEvents } from "@/lib/providers/calendar";
import { fetchChats } from "@/lib/providers/teams";
import { fetchAccountInfo } from "@/lib/providers/instagram";
import { fetchAllFeeds } from "@/lib/providers/rss";

// ─── Types ──────────────────────────────────────────────────────

export interface ServiceSnapshot {
  /** Service display name */
  service: string;
  /** Whether an access token was available for this service */
  connected: boolean;
  /** One-line natural language summary — null if disconnected or failed */
  summary: string | null;
  /** ISO timestamp of when this snapshot was captured */
  fetchedAt: string;
}

export interface LiveContext {
  /** Calendar summary (Google Calendar) */
  calendar: ServiceSnapshot;
  /** Email summary (Gmail) */
  gmail: ServiceSnapshot;
  /** GitHub activity summary */
  github: ServiceSnapshot;
  /** Spotify playback summary */
  spotify: ServiceSnapshot;
  /** Teams chat summary */
  teams: ServiceSnapshot;
  /** Weather summary */
  weather: ServiceSnapshot;
  /** Instagram summary */
  instagram: ServiceSnapshot;
  /** News/RSS summary */
  news: ServiceSnapshot;
  /** ISO timestamp of when the full context gather started */
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────

const TIMEOUT_MS = 2_000;

/**
 * Race a promise against a timeout. Returns `null` on timeout or error.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  label: string
): Promise<T | null> {
  try {
    const result = await Promise.race([
      promise,
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS)
      ),
    ]);
    return result;
  } catch (err) {
    console.warn(
      `[context-builder] ${label} failed:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function snap(
  service: string,
  connected: boolean,
  summary: string | null
): ServiceSnapshot {
  return { service, connected, summary, fetchedAt: new Date().toISOString() };
}

function relativeTime(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const mins = Math.round(absDiff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return diff > 0 ? `in ${mins} min` : `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return diff > 0 ? `in ${hrs}h` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return diff > 0 ? `in ${days}d` : `${days}d ago`;
}

// ─── Individual fetchers ────────────────────────────────────────

async function fetchCalendarSummary(
  token: string
): Promise<string> {
  const data = await fetchTodayEvents(token);
  const events = data.events;
  if (!events.length) return "No events today.";

  // Find the next upcoming event
  const now = Date.now();
  const upcoming = events
    .filter((e) => {
      const start = e.start.dateTime || e.start.date || "";
      return new Date(start).getTime() > now;
    })
    .sort((a, b) => {
      const aT = new Date(a.start.dateTime || a.start.date || "").getTime();
      const bT = new Date(b.start.dateTime || b.start.date || "").getTime();
      return aT - bT;
    });

  const count = events.length;
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const when = relativeTime(next.start.dateTime || next.start.date || "");
    return `${count} event${count !== 1 ? "s" : ""} today. Next: "${next.summary}" ${when}.`;
  }

  return `${count} event${count !== 1 ? "s" : ""} today (all past).`;
}

async function fetchGmailSummary(token: string): Promise<string> {
  const data = await fetchInbox(token, 20);
  const unread = data.messages.filter((m) => m.isUnread);
  if (!unread.length) return "Inbox zero — no unread emails.";

  const top = unread[0];
  return `${unread.length} unread email${unread.length !== 1 ? "s" : ""}. Top: "${top.subject}" from ${top.from}.`;
}

async function fetchGitHubSummary(token: string): Promise<string> {
  const [notifications, profile] = await Promise.all([
    fetchNotifications(token),
    fetchProfile(token),
  ]);

  const unread = notifications.filter((n) => n.unread);
  const prReviews = unread.filter(
    (n) => n.reason === "review_requested" || n.type === "PullRequest"
  );

  const parts: string[] = [];
  if (prReviews.length) {
    parts.push(`${prReviews.length} PR review${prReviews.length !== 1 ? "s" : ""} requested`);
  }
  if (unread.length) {
    parts.push(`${unread.length} unread notification${unread.length !== 1 ? "s" : ""}`);
  } else {
    parts.push("No unread notifications");
  }
  parts.push(`@${profile.login}`);

  return parts.join(". ") + ".";
}

async function fetchSpotifySummary(token: string): Promise<string> {
  const state = await fetchNowPlaying(token);
  if (!state.isPlaying || !state.track) {
    return "Nothing playing right now.";
  }

  const artists = state.track.artists.map((a) => a.name).join(", ");
  return `Playing "${state.track.name}" by ${artists}.`;
}

async function fetchTeamsSummary(token: string): Promise<string> {
  const data = await fetchChats(token, 20);
  const chats = data.chats;
  if (!chats.length) return "No recent Teams chats.";

  const withUnread = chats.filter((c) => (c.unreadMessageCount ?? 0) > 0);
  const totalUnread = withUnread.reduce(
    (sum, c) => sum + (c.unreadMessageCount ?? 0),
    0
  );

  if (!totalUnread) return "No unread Teams messages.";

  return `${totalUnread} unread message${totalUnread !== 1 ? "s" : ""} across ${withUnread.length} chat${withUnread.length !== 1 ? "s" : ""}.`;
}

async function fetchWeatherSummary(): Promise<string> {
  // Weather is public (no auth token needed) — use the API route's cached fetcher
  const city = process.env.DEFAULT_CITY || "Minneapolis";
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey || apiKey === "your-openweather-api-key") {
    return "Weather data unavailable (no API key).";
  }

  const data = await cachedFetch<{
    location: string;
    temperature: number;
    description: string;
    main: string;
  }>(
    `weather:agent:${city.toLowerCase()}`,
    async () => {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=imperial`
      );
      if (!res.ok) throw new Error(`Weather ${res.status}`);
      const raw = await res.json();
      return {
        location: `${raw.name}, ${raw.sys.country}`,
        temperature: Math.round(raw.main.temp),
        description: raw.weather[0].description,
        main: raw.weather[0].main,
      };
    },
    300 // 5-min cache
  );

  if (!data) return "Weather data unavailable.";

  return `${data.temperature}°F, ${data.description} in ${data.location}.`;
}

async function fetchInstagramSummary(token: string): Promise<string> {
  const account = await fetchAccountInfo(token);
  const parts: string[] = [];
  parts.push(`@${account.username}`);
  parts.push(`${account.followersCount.toLocaleString()} followers`);
  parts.push(`${account.mediaCount} posts`);
  return parts.join(" · ") + ".";
}

async function fetchNewsSummary(): Promise<string> {
  const items = await fetchAllFeeds();
  if (!items.length) return "No news articles available.";

  const recent = items.slice(0, 5);
  return `${items.length} articles from ${new Set(recent.map((i) => i.source)).size}+ sources. Latest: "${recent[0].title}".`;
}

// ─── Main export ────────────────────────────────────────────────

/**
 * Gather lightweight live context from every connected service.
 * Each fetch has an independent 2-second timeout — failures are
 * silently caught and the summary is set to `null`.
 */
export async function gatherLiveContext(): Promise<LiveContext> {
  const timestamp = new Date().toISOString();

  // Get the current session to determine which services are connected
  const session = (await auth()) as SessionWithAccessToken | null;

  const googleToken = session?.accessToken ?? null;
  const githubToken = session?.githubToken ?? null;
  const spotifyToken = session?.spotifyToken ?? null;
  const teamsToken = session?.teamsToken ?? null;
  const instagramToken = session?.instagramToken ?? null;

  // Fire all fetches in parallel — each wrapped in its own timeout
  const [
    calendarResult,
    gmailResult,
    githubResult,
    spotifyResult,
    teamsResult,
    weatherResult,
    instagramResult,
    newsResult,
  ] = await Promise.all([
    // Calendar
    googleToken
      ? withTimeout(fetchCalendarSummary(googleToken), "Calendar")
      : Promise.resolve(null),
    // Gmail
    googleToken
      ? withTimeout(fetchGmailSummary(googleToken), "Gmail")
      : Promise.resolve(null),
    // GitHub
    githubToken
      ? withTimeout(fetchGitHubSummary(githubToken), "GitHub")
      : Promise.resolve(null),
    // Spotify
    spotifyToken
      ? withTimeout(fetchSpotifySummary(spotifyToken), "Spotify")
      : Promise.resolve(null),
    // Teams
    teamsToken
      ? withTimeout(fetchTeamsSummary(teamsToken), "Teams")
      : Promise.resolve(null),
    // Weather (no auth needed)
    withTimeout(fetchWeatherSummary(), "Weather"),
    // Instagram
    instagramToken
      ? withTimeout(fetchInstagramSummary(instagramToken), "Instagram")
      : Promise.resolve(null),
    // News/RSS (no auth needed)
    withTimeout(fetchNewsSummary(), "News"),
  ]);

  return {
    calendar: snap("Google Calendar", !!googleToken, calendarResult),
    gmail: snap("Gmail", !!googleToken, gmailResult),
    github: snap("GitHub", !!githubToken, githubResult),
    spotify: snap("Spotify", !!spotifyToken, spotifyResult),
    teams: snap("Microsoft Teams", !!teamsToken, teamsResult),
    weather: snap("Weather", true, weatherResult),
    instagram: snap("Instagram", !!instagramToken, instagramResult),
    news: snap("News/RSS", true, newsResult),
    timestamp,
  };
}
