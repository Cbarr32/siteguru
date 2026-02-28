/**
 * worker/index.ts
 * ───────────────
 * Railway cron-worker entry point.
 *
 * Schedules four background jobs:
 *  1. token-refresh   — every 15 min  — rotates expiring OAuth tokens
 *  2. context-snapshot — daily 23:59   — builds + caches agent context
 *  3. rss-poll         — every 15 min  — fetches & caches RSS feeds
 *  4. cache-warm       — every 5 min   — pre-warms service caches
 */

import cron from "node-cron";
import { refreshTokens } from "./jobs/token-refresh";
import { snapshotContext } from "./jobs/context-snapshot";
import { pollRss } from "./jobs/rss-poll";
import { warmCaches } from "./jobs/cache-warm";

// ─── Helpers ────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

async function safeRun(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    console.log(`[${ts()}] ✓ ${name} completed in ${Date.now() - start}ms`);
  } catch (err) {
    console.error(
      `[${ts()}] ✗ ${name} failed:`,
      err instanceof Error ? err.message : err
    );
  }
}

// ─── Schedule ───────────────────────────────────────────────────

console.log(`[${ts()}] SiteGuru worker starting…`);

// 1) Token refresh — every 15 minutes
cron.schedule("*/15 * * * *", () => safeRun("token-refresh", refreshTokens), {
  timezone: "America/Chicago",
});

// 2) Context snapshot — daily at 23:59
cron.schedule("59 23 * * *", () => safeRun("context-snapshot", snapshotContext), {
  timezone: "America/Chicago",
});

// 3) RSS poll — every 15 minutes
cron.schedule("*/15 * * * *", () => safeRun("rss-poll", pollRss), {
  timezone: "America/Chicago",
});

// 4) Cache warm — every 5 minutes
cron.schedule("*/5 * * * *", () => safeRun("cache-warm", warmCaches), {
  timezone: "America/Chicago",
});

// ─── Run once on startup ────────────────────────────────────────

(async () => {
  console.log(`[${ts()}] Running initial jobs…`);
  await Promise.allSettled([
    safeRun("token-refresh", refreshTokens),
    safeRun("rss-poll", pollRss),
    safeRun("cache-warm", warmCaches),
  ]);
  console.log(`[${ts()}] Initial run complete. Cron jobs active.`);
})();

// ─── Graceful shutdown ──────────────────────────────────────────

function shutdown(signal: string) {
  console.log(`[${ts()}] Received ${signal}, shutting down…`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
