import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cachedFetch } from "@/lib/redis";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  try {
    // Get articles from database (with caching)
    const cacheKey = `news:${category || "all"}:${limit}`;
    const data = await cachedFetch(
      cacheKey,
      async () => {
        const where = category ? { feedSource: { category } } : {};

        const articles = await prisma.article.findMany({
          where,
          orderBy: { publishedAt: "desc" },
          take: limit,
          include: {
            feedSource: {
              select: { name: true, category: true },
            },
          },
        });

        const feeds = await prisma.feedSource.findMany({
          where: category ? { category } : {},
          select: {
            id: true,
            name: true,
            category: true,
            _count: { select: { articles: true } },
          },
        });

        return {
          articles: articles.map((a: { id: string; title: string; link: string; description: string | null; author: string | null; publishedAt: Date | null; imageUrl: string | null; feedSource: { name: string; category: string } }) => ({
            id: a.id,
            title: a.title,
            link: a.link,
            description: a.description,
            author: a.author,
            publishedAt: a.publishedAt?.toISOString(),
            imageUrl: a.imageUrl,
            feedSource: a.feedSource,
          })),
          feeds: feeds.map((f: { id: string; name: string; category: string; _count: { articles: number } }) => ({
            id: f.id,
            name: f.name,
            category: f.category,
            articleCount: f._count.articles,
          })),
        };
      },
      300 // Cache for 5 minutes
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("News API error:", error);
    // Return mock data if database is not available
    return NextResponse.json(getMockNews());
  }
}

function getMockNews() {
  return {
    articles: [
      {
        id: "mock-1",
        title: "Welcome to SiteGuru — Your Personal Dashboard",
        link: "#",
        description:
          "Set up your database and seed news feeds to get real articles. Run 'pnpm db:push && pnpm db:seed' to get started.",
        author: "SiteGuru",
        publishedAt: new Date().toISOString(),
        imageUrl: null,
        feedSource: { name: "SiteGuru", category: "general" },
      },
      {
        id: "mock-2",
        title: "Configure your news sources in Settings",
        link: "#",
        description:
          "SiteGuru comes pre-loaded with news sources from AP News, Reuters, BBC, NPR, The Guardian, Al Jazeera, TechCrunch, Hacker News, The Verge, and Ars Technica.",
        author: "SiteGuru",
        publishedAt: new Date().toISOString(),
        imageUrl: null,
        feedSource: { name: "SiteGuru", category: "tech" },
      },
    ],
    feeds: [],
  };
}
