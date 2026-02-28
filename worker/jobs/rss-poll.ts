/**
 * worker/jobs/rss-poll.ts
 * ───────────────────────
 * Fetches all FeedSource records from the database, parses each RSS
 * feed, and caches the merged article list in Redis.
 *
 * Runs every 15 minutes. Each feed has a 5-second request timeout.
 * Results are cached under `siteguru:rss:all` with a 15-minute TTL,
 * and per-source under `siteguru:rss:{sourceId}`.
 */

import Parser from "rss-parser";
import getDb from "../lib/db";
import { getRedis } from "../lib/redis";

// ─── Types ──────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  link: string;
  description: string;
  source: string;
  category: string;
  pubDate: string;
  imageUrl: string | null;
  author: string | null;
  guid: string | null;
}

interface FeedResult {
  source: string;
  sourceId: string;
  category: string;
  items: NewsItem[];
}

// ─── Parser setup ───────────────────────────────────────────────

const parser: Parser = new Parser({
  timeout: 5000,
  headers: {
    "User-Agent": "SiteGuru-Worker/1.0",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: false }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: false }],
      ["enclosure", "enclosure", { keepArray: false }],
    ],
  },
});

// ─── Helpers ────────────────────────────────────────────────────

function extractImage(item: Parser.Item & Record<string, unknown>): string | null {
  // Try media:content
  const mc = item.mediaContent as { $?: { url?: string } } | undefined;
  if (mc?.$?.url) return mc.$.url;

  // Try media:thumbnail
  const mt = item.mediaThumbnail as { $?: { url?: string } } | undefined;
  if (mt?.$?.url) return mt.$.url;

  // Try enclosure
  const enc = item.enclosure as { url?: string; type?: string } | undefined;
  if (enc?.url && enc.type?.startsWith("image")) return enc.url;

  return null;
}

function normalizeItem(
  item: Parser.Item,
  source: string,
  sourceId: string,
  category: string
): NewsItem | null {
  if (!item.title || !item.link) return null;

  return {
    title: item.title.trim(),
    link: item.link.trim(),
    description: (item.contentSnippet || item.content || "")
      .replace(/<[^>]*>/g, "")
      .slice(0, 500)
      .trim(),
    source,
    category,
    pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
    imageUrl: extractImage(item as Parser.Item & Record<string, unknown>),
    author: (item.creator || (item as Record<string, unknown>).author as string || null) as string | null,
    guid: (item.guid || (item as Record<string, unknown>).id as string || item.link || null) as string | null,
  };
}

// ─── Main ───────────────────────────────────────────────────────

export async function pollRss(): Promise<void> {
  const db = getDb();
  const redis = getRedis();

  // Get all active feed sources
  const sources = await db.feedSource.findMany({
    select: {
      id: true,
      name: true,
      url: true,
      category: true,
    },
  });

  if (!sources.length) {
    console.log("[rss-poll] No feed sources configured");
    return;
  }

  console.log(`[rss-poll] Fetching ${sources.length} feed(s)…`);

  // Fetch all feeds in parallel with individual timeouts
  const settledResults = await Promise.allSettled(
    sources.map(async (src): Promise<FeedResult> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const feed = await parser.parseURL(src.url);
        clearTimeout(timeoutId);

        const items = (feed.items ?? [])
          .slice(0, 30)
          .map((item) => normalizeItem(item, src.name, src.id, src.category))
          .filter((x): x is NewsItem => x !== null);

        return { source: src.name, sourceId: src.id, category: src.category, items };
      } catch {
        clearTimeout(timeoutId);
        return { source: src.name, sourceId: src.id, category: src.category, items: [] };
      }
    })
  );

  // Merge all items
  const allItems: NewsItem[] = [];
  let feedsSucceeded = 0;

  for (const result of settledResults) {
    if (result.status === "fulfilled" && result.value.items.length > 0) {
      feedsSucceeded++;
      allItems.push(...result.value.items);

      // Cache per-source
      try {
        await redis.setex(
          `siteguru:rss:${result.value.sourceId}`,
          900,
          JSON.stringify(result.value.items)
        );
      } catch {
        // Redis unavailable
      }
    }
  }

  // Sort by pubDate descending
  allItems.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  // Cache the merged list
  try {
    await redis.setex(
      "siteguru:rss:all",
      900, // 15 min TTL — matches the poll interval
      JSON.stringify(allItems)
    );
  } catch {
    // Redis unavailable
  }

  // Also persist new articles to the database (upsert to avoid dupes)
  let articlesUpserted = 0;
  for (const result of settledResults) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value.items) {
      if (!item.guid) continue;
      try {
        await db.article.upsert({
          where: {
            feedSourceId_guid: {
              feedSourceId: result.value.sourceId,
              guid: item.guid,
            },
          },
          create: {
            feedSourceId: result.value.sourceId,
            title: item.title,
            link: item.link,
            description: item.description || null,
            author: item.author,
            publishedAt: item.pubDate ? new Date(item.pubDate) : null,
            imageUrl: item.imageUrl,
            guid: item.guid,
          },
          update: {
            title: item.title,
            description: item.description || null,
            imageUrl: item.imageUrl,
          },
        });
        articlesUpserted++;
      } catch {
        // Ignore individual upsert failures
      }
    }
  }

  console.log(
    `[rss-poll] ${feedsSucceeded}/${sources.length} feeds ok, ` +
      `${allItems.length} articles cached, ${articlesUpserted} upserted to DB`
  );
}
