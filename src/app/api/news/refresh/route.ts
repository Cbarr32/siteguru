import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { prisma } from "@/lib/db";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "SiteGuru/1.0 RSS Reader",
  },
});

export async function POST() {
  try {
    const feeds = await prisma.feedSource.findMany();
    const results: { feed: string; added: number; errors: string[] }[] = [];

    for (const feed of feeds) {
      const feedResult = { feed: feed.name, added: 0, errors: [] as string[] };

      try {
        const parsed = await parser.parseURL(feed.url);

        for (const item of parsed.items?.slice(0, 30) || []) {
          try {
            const guid = item.guid || item.link || item.title || "";
            if (!item.title || !item.link) continue;

            await prisma.article.upsert({
              where: {
                feedSourceId_guid: {
                  feedSourceId: feed.id,
                  guid,
                },
              },
              update: {
                title: item.title,
                description: item.contentSnippet || item.content || null,
                author: item.creator || item.author || null,
                publishedAt: item.pubDate
                  ? new Date(item.pubDate)
                  : null,
                imageUrl:
                  item.enclosure?.url ||
                  extractImageFromContent(item.content || "") ||
                  null,
              },
              create: {
                feedSourceId: feed.id,
                title: item.title,
                link: item.link,
                description: item.contentSnippet || item.content || null,
                author: item.creator || item.author || null,
                publishedAt: item.pubDate
                  ? new Date(item.pubDate)
                  : null,
                imageUrl:
                  item.enclosure?.url ||
                  extractImageFromContent(item.content || "") ||
                  null,
                guid,
              },
            });
            feedResult.added++;
          } catch (err) {
            feedResult.errors.push(
              `Article: ${item.title?.slice(0, 50)}: ${err instanceof Error ? err.message : "Unknown error"}`
            );
          }
        }
      } catch (err) {
        feedResult.errors.push(
          `Feed parse error: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }

      results.push(feedResult);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("RSS refresh error:", error);
    return NextResponse.json(
      { error: "Failed to refresh feeds" },
      { status: 500 }
    );
  }
}

function extractImageFromContent(content: string): string | null {
  const match = content.match(/<img[^>]+src="([^">]+)"/);
  return match ? match[1] : null;
}
