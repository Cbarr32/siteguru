import Parser from "rss-parser";
import { prisma } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string; // ISO string
  description: string;
  category: string;
  imageUrl?: string;
}

interface FeedResult {
  source: string;
  category: string;
  items: NewsItem[];
}

// ─── Parser Instance ────────────────────────────────────────────

const parser = new Parser({
  timeout: 5000,
  headers: {
    "User-Agent": "SiteGuru/1.0 RSS Reader",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
});

// ─── Helpers ────────────────────────────────────────────────────

function extractImageFromContent(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"'>]+)["']/);
  return match?.[1] ?? null;
}

function normalizeItem(
  item: Parser.Item,
  source: string,
  category: string
): NewsItem | null {
  if (!item.title || !item.link) return null;

  const pubDate =
    item.pubDate || item.isoDate
      ? new Date(item.pubDate || item.isoDate || "").toISOString()
      : new Date().toISOString();

  const description = (
    item.contentSnippet ||
    item.content?.replace(/<[^>]*>/g, "") ||
    ""
  )
    .trim()
    .slice(0, 300);

  const imageUrl =
    item.enclosure?.url ||
    extractImageFromContent(item.content || "") ||
    undefined;

  return {
    title: item.title.trim(),
    link: item.link,
    source,
    pubDate,
    description,
    category,
    imageUrl,
  };
}

// ─── Fetch a single RSS feed ────────────────────────────────────

export async function fetchSingleFeed(url: string): Promise<NewsItem[]> {
  const feed = await parser.parseURL(url);

  return (feed.items ?? [])
    .map((item) => normalizeItem(item, feed.title || url, "general"))
    .filter((x): x is NewsItem => x !== null);
}

// ─── Fetch all active feeds in parallel ─────────────────────────

export async function fetchAllFeeds(): Promise<NewsItem[]> {
  // Query active FeedSource records from Prisma
  const sources = await prisma.feedSource.findMany({
    where: {},
    select: {
      name: true,
      url: true,
      category: true,
    },
  });

  if (sources.length === 0) {
    return [];
  }

  // Fetch all feeds in parallel, each with a 5-second timeout
  const settledResults = await Promise.allSettled(
    sources.map(async (src): Promise<FeedResult> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const feed = await parser.parseURL(src.url);
        clearTimeout(timeoutId);

        const items = (feed.items ?? [])
          .slice(0, 30) // cap per-feed to prevent one source dominating
          .map((item) => normalizeItem(item, src.name, src.category))
          .filter((x): x is NewsItem => x !== null);

        return { source: src.name, category: src.category, items };
      } catch {
        clearTimeout(timeoutId);
        return { source: src.name, category: src.category, items: [] };
      }
    })
  );

  // Merge all items from fulfilled promises
  const allItems: NewsItem[] = [];
  for (const result of settledResults) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value.items);
    }
  }

  // Sort by pubDate descending (newest first)
  allItems.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  return allItems;
}
