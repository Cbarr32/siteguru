import { NextRequest, NextResponse } from "next/server";
import { cachedFetch } from "@/lib/redis";
import { fetchAllFeeds, type NewsItem } from "@/lib/providers/rss";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category"); // "general" | "world" | "tech" | null

  try {
    const cacheKey = `news:rss:${category || "all"}`;

    const articles = await cachedFetch<NewsItem[]>(
      cacheKey,
      async () => {
        const all = await fetchAllFeeds();

        if (category) {
          return all.filter((item) => item.category === category);
        }
        return all;
      },
      900 // Cache 15 minutes
    );

    return NextResponse.json({
      articles,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("News API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
