/**
 * worker/jobs/context-snapshot.ts
 * ───────────────────────────────
 * Builds a lightweight "context snapshot" for every user and stores it
 * in Redis so the agent system-prompt can boot instantly without
 * hitting live APIs on every chat message.
 *
 * Runs once daily (23:59) and also once on worker startup.
 *
 * The snapshot mirrors LiveContext from src/lib/agent/context-builder.ts
 * but runs server-side using stored tokens (no auth session needed).
 */

import getDb from "../lib/db";
import { getRedis, cachedFetch } from "../lib/redis";

// ─── Types ──────────────────────────────────────────────────────

interface ServiceSnapshot {
  service: string;
  connected: boolean;
  summary: string | null;
  fetchedAt: string;
}

interface UserContext {
  userId: string;
  calendar: ServiceSnapshot;
  gmail: ServiceSnapshot;
  github: ServiceSnapshot;
  spotify: ServiceSnapshot;
  teams: ServiceSnapshot;
  weather: ServiceSnapshot;
  news: ServiceSnapshot;
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────

const TIMEOUT_MS = 5_000;

async function withTimeout<T>(
  promise: Promise<T>,
  label: string
): Promise<T | null> {
  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label} timed out`)),
          TIMEOUT_MS
        )
      ),
    ]);
    return result;
  } catch (err) {
    console.warn(
      `[context-snapshot] ${label} failed:`,
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

// ─── Service fetchers (use stored tokens) ───────────────────────

async function fetchCalendarSummary(token: string): Promise<string> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      new URLSearchParams({
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "20",
      }),
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  const data = (await res.json()) as {
    items?: Array<{ summary?: string; start: { dateTime?: string; date?: string } }>;
  };
  const events = data.items ?? [];
  if (!events.length) return "No events today.";
  return `${events.length} event(s) today. Next: "${events[0].summary ?? "Untitled"}".`;
}

async function fetchGmailSummary(token: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?` +
      new URLSearchParams({ q: "is:unread", maxResults: "20" }),
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`Gmail API ${res.status}`);
  const data = (await res.json()) as {
    resultSizeEstimate?: number;
  };
  const count = data.resultSizeEstimate ?? 0;
  if (!count) return "Inbox zero — no unread emails.";
  return `${count} unread email(s).`;
}

async function fetchGitHubSummary(token: string): Promise<string> {
  const res = await fetch(
    "https://api.github.com/notifications?per_page=50",
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
  );

  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const notifications = (await res.json()) as Array<{ unread: boolean }>;
  const unread = notifications.filter((n) => n.unread).length;
  if (!unread) return "No unread GitHub notifications.";
  return `${unread} unread notification(s).`;
}

async function fetchSpotifySummary(token: string): Promise<string> {
  const res = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status === 204 || !res.ok) return "Nothing playing.";
  const data = (await res.json()) as {
    is_playing: boolean;
    item?: { name: string; artists: Array<{ name: string }> };
  };
  if (!data.is_playing || !data.item) return "Nothing playing.";
  const artists = data.item.artists.map((a) => a.name).join(", ");
  return `Playing "${data.item.name}" by ${artists}.`;
}

async function fetchTeamsSummary(token: string): Promise<string> {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/chats?$top=20&$expand=lastMessagePreview",
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`Teams API ${res.status}`);
  const data = (await res.json()) as {
    value: Array<{ unreadMessageCount?: number }>;
  };
  const totalUnread = data.value.reduce(
    (sum, c) => sum + (c.unreadMessageCount ?? 0),
    0
  );
  if (!totalUnread) return "No unread Teams messages.";
  return `${totalUnread} unread Teams message(s).`;
}

async function fetchWeatherSummary(): Promise<string> {
  const city = process.env.DEFAULT_CITY || "Minneapolis";
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return "Weather unavailable (no API key).";

  return cachedFetch(
    `siteguru:weather:snapshot:${city.toLowerCase()}`,
    async () => {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=imperial`
      );
      if (!res.ok) throw new Error(`Weather ${res.status}`);
      const raw = (await res.json()) as {
        main: { temp: number };
        weather: Array<{ description: string }>;
        name: string;
        sys: { country: string };
      };
      return `${Math.round(raw.main.temp)}°F, ${raw.weather[0].description} in ${raw.name}, ${raw.sys.country}.`;
    },
    600 // 10-min cache
  );
}

async function fetchNewsSummary(): Promise<string> {
  const redis = getRedis();
  try {
    const cached = await redis.get("siteguru:rss:all");
    if (cached) {
      const items = JSON.parse(cached) as Array<{ title: string; source: string }>;
      if (items.length) {
        return `${items.length} articles. Latest: "${items[0].title}".`;
      }
    }
  } catch {
    // Redis unavailable
  }
  return "No cached news articles.";
}

// ─── Main ───────────────────────────────────────────────────────

export async function snapshotContext(): Promise<void> {
  const db = getDb();
  const redis = getRedis();

  // Get all users with at least one OAuth account
  const users = await db.user.findMany({
    where: {
      accounts: { some: {} },
    },
    select: {
      id: true,
      accounts: {
        select: {
          provider: true,
          access_token: true,
        },
      },
    },
  });

  if (!users.length) {
    console.log("[context-snapshot] No users with accounts found");
    return;
  }

  console.log(
    `[context-snapshot] Building snapshots for ${users.length} user(s)…`
  );

  for (const user of users) {
    const tokens: Record<string, string | null> = {};
    for (const acct of user.accounts) {
      tokens[acct.provider] = acct.access_token;
    }

    const googleToken = tokens["google"] ?? null;
    const githubToken = tokens["github"] ?? null;
    const spotifyToken = tokens["spotify"] ?? null;
    const teamsToken = tokens["microsoft-entra-id"] ?? null;

    const timestamp = new Date().toISOString();

    const [
      calendarResult,
      gmailResult,
      githubResult,
      spotifyResult,
      teamsResult,
      weatherResult,
      newsResult,
    ] = await Promise.all([
      googleToken
        ? withTimeout(fetchCalendarSummary(googleToken), "Calendar")
        : Promise.resolve(null),
      googleToken
        ? withTimeout(fetchGmailSummary(googleToken), "Gmail")
        : Promise.resolve(null),
      githubToken
        ? withTimeout(fetchGitHubSummary(githubToken), "GitHub")
        : Promise.resolve(null),
      spotifyToken
        ? withTimeout(fetchSpotifySummary(spotifyToken), "Spotify")
        : Promise.resolve(null),
      teamsToken
        ? withTimeout(fetchTeamsSummary(teamsToken), "Teams")
        : Promise.resolve(null),
      withTimeout(fetchWeatherSummary(), "Weather"),
      withTimeout(fetchNewsSummary(), "News"),
    ]);

    const snapshot: UserContext = {
      userId: user.id,
      calendar: snap("Google Calendar", !!googleToken, calendarResult),
      gmail: snap("Gmail", !!googleToken, gmailResult),
      github: snap("GitHub", !!githubToken, githubResult),
      spotify: snap("Spotify", !!spotifyToken, spotifyResult),
      teams: snap("Microsoft Teams", !!teamsToken, teamsResult),
      weather: snap("Weather", true, weatherResult),
      news: snap("News/RSS", true, newsResult),
      timestamp,
    };

    // Store in Redis with 24-hour TTL (next daily run will refresh)
    try {
      await redis.setex(
        `siteguru:context:${user.id}`,
        86_400,
        JSON.stringify(snapshot)
      );
    } catch {
      console.warn(
        `[context-snapshot] Failed to cache snapshot for user ${user.id}`
      );
    }
  }

  console.log(
    `[context-snapshot] Snapshots built for ${users.length} user(s)`
  );
}
