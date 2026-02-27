import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEFAULT_FEEDS = [
  // ─── General / World News ─────────────────────────────────────
  {
    name: "AP News",
    url: "https://rsshub.app/apnews/topics/apf-topnews",
    category: "general",
    description: "Associated Press Top News",
    isDefault: true,
  },
  {
    name: "Reuters",
    url: "https://www.reutersagency.com/feed/",
    category: "general",
    description: "Reuters Agency World News",
    isDefault: true,
  },
  {
    name: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    category: "world",
    description: "BBC World News",
    isDefault: true,
  },
  {
    name: "NPR News",
    url: "https://feeds.npr.org/1001/rss.xml",
    category: "general",
    description: "NPR News Headlines",
    isDefault: true,
  },
  {
    name: "The Guardian",
    url: "https://www.theguardian.com/world/rss",
    category: "world",
    description: "The Guardian World News",
    isDefault: true,
  },
  {
    name: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    category: "world",
    description: "Al Jazeera English",
    isDefault: true,
  },

  // ─── Tech ─────────────────────────────────────────────────────
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    category: "tech",
    description: "TechCrunch - Startup and Technology News",
    isDefault: true,
  },
  {
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
    category: "tech",
    description: "Hacker News Front Page",
    isDefault: true,
  },
  {
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    category: "tech",
    description: "The Verge - All Posts",
    isDefault: true,
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    category: "tech",
    description: "Ars Technica - All content",
    isDefault: true,
  },
];

async function main() {
  console.log("🌱 Seeding database...\n");

  // Seed feed sources
  for (const feed of DEFAULT_FEEDS) {
    const result = await prisma.feedSource.upsert({
      where: { url: feed.url },
      update: {
        name: feed.name,
        category: feed.category,
        description: feed.description,
        isDefault: feed.isDefault,
      },
      create: feed,
    });
    console.log(`  ✓ ${result.name} (${result.category})`);
  }

  console.log(`\n✅ Seeded ${DEFAULT_FEEDS.length} feed sources`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
