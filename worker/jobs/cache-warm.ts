/**
 * worker/jobs/cache-warm.ts
 * ─────────────────────────
 * Pre-warms Redis caches for high-frequency panel data so the
 * dashboard loads instantly. Runs every 5 minutes.
 *
 * Services warmed:
 *  - Weather (public, no auth needed)
 *  - Gmail inbox count (per-user, needs Google token)
 *  - GitHub notifications (per-user, needs GitHub token)
 *  - Calendar events today (per-user, needs Google token)
 */

import getDb from "../lib/db";
import { getRedis } from "../lib/redis";

// ─── Helpers ────────────────────────────────────────────────────

const TIMEOUT_MS = 4_000;

async function withTimeout<T>(
  promise: Promise<T>,
  label: string
): Promise<T | null> {
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label} timed out`)),
          TIMEOUT_MS
        )
      ),
    ]);
  } catch (err) {
    console.warn(
      `[cache-warm] ${label}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ─── Weather warm ───────────────────────────────────────────────

async function warmWeather(): Promise<void> {
  const redis = getRedis();
  const city = process.env.DEFAULT_CITY || "Minneapolis";
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey || apiKey === "your-openweather-api-key") return;

  // Current weather
  const currentRes = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=imperial`
  );
  if (currentRes.ok) {
    const data = await currentRes.json();
    await redis.setex(
      `siteguru:weather:current:${city.toLowerCase()}`,
      300,
      JSON.stringify(data)
    );
  }

  // 5-day forecast
  const forecastRes = await fetch(
    `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=imperial`
  );
  if (forecastRes.ok) {
    const data = await forecastRes.json();
    await redis.setex(
      `siteguru:weather:forecast:${city.toLowerCase()}`,
      300,
      JSON.stringify(data)
    );
  }
}

// ─── Per-user service warms ─────────────────────────────────────

async function warmUserGoogle(
  token: string,
  userId: string
): Promise<void> {
  const redis = getRedis();

  // Gmail unread count
  const gmailRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?` +
      new URLSearchParams({ q: "is:unread", maxResults: "5" }),
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (gmailRes.ok) {
    const data = await gmailRes.json();
    await redis.setex(
      `siteguru:gmail:unread:${userId}`,
      300,
      JSON.stringify(data)
    );
  }

  // Calendar events today
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  const calRes = await fetch(
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
  if (calRes.ok) {
    const data = await calRes.json();
    await redis.setex(
      `siteguru:calendar:today:${userId}`,
      300,
      JSON.stringify(data)
    );
  }
}

async function warmUserGitHub(
  token: string,
  userId: string
): Promise<void> {
  const redis = getRedis();

  const res = await fetch(
    "https://api.github.com/notifications?per_page=20",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (res.ok) {
    const data = await res.json();
    await redis.setex(
      `siteguru:github:notifications:${userId}`,
      300,
      JSON.stringify(data)
    );
  }
}

// ─── Main ───────────────────────────────────────────────────────

export async function warmCaches(): Promise<void> {
  const db = getDb();

  // 1. Weather (no auth needed)
  await withTimeout(warmWeather(), "Weather");

  // 2. Per-user service warming
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
    console.log("[cache-warm] No users to warm caches for");
    return;
  }

  let warmed = 0;

  for (const user of users) {
    const tokens: Record<string, string | null> = {};
    for (const acct of user.accounts) {
      tokens[acct.provider] = acct.access_token;
    }

    const promises: Promise<unknown>[] = [];

    // Google services (Gmail + Calendar)
    if (tokens["google"]) {
      promises.push(
        withTimeout(
          warmUserGoogle(tokens["google"], user.id),
          `Google:${user.id}`
        )
      );
    }

    // GitHub notifications
    if (tokens["github"]) {
      promises.push(
        withTimeout(
          warmUserGitHub(tokens["github"], user.id),
          `GitHub:${user.id}`
        )
      );
    }

    if (promises.length) {
      await Promise.allSettled(promises);
      warmed++;
    }
  }

  console.log(
    `[cache-warm] Warmed caches for ${warmed} user(s), weather done`
  );
}
