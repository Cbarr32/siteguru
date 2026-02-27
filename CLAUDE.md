# SiteGuru

A customizable personal dashboard built with Next.js 14, TypeScript, Tailwind CSS, and shadcn/ui.

## Features

- **Weather Panel** — Real-time weather with 5-day forecast (OpenWeatherMap API)
- **News/RSS Panel** — Aggregated news from 10+ sources with category filtering
- **Drag & Drop Layout** — Powered by react-grid-layout
- **Collapsible Sidebar** — Clean navigation
- **Redis Caching** — Fast data fetching with intelligent caching
- **Prisma ORM** — PostgreSQL database with full schema

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** PostgreSQL + Prisma ORM
- **Caching:** Redis (ioredis)
- **State:** Zustand
- **Auth:** NextAuth.js v5 (beta)
- **Grid:** react-grid-layout

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL
- Redis (optional, gracefully degrades)

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL, API keys, etc.

# Push schema to database
pnpm db:push

# Seed the database with default news feeds
pnpm db:seed

# Start development server
pnpm dev
```

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL` | App URL (http://localhost:3000) |
| `NEXTAUTH_SECRET` | NextAuth secret key |
| `REDIS_URL` | Redis connection string |
| `OPENWEATHER_API_KEY` | OpenWeatherMap API key |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── news/
│   │   │   ├── route.ts          # News articles API
│   │   │   └── refresh/route.ts  # RSS feed refresh
│   │   └── weather/route.ts      # Weather API
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                  # Dashboard page
├── components/
│   ├── layout/
│   │   ├── DashboardGrid.tsx     # Responsive grid layout
│   │   └── Sidebar.tsx           # Navigation sidebar
│   ├── panels/
│   │   ├── BasePanel.tsx         # Base panel wrapper
│   │   ├── NewsPanel.tsx         # News/RSS panel
│   │   └── WeatherPanel.tsx      # Weather panel
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── db.ts                     # Prisma client
│   ├── redis.ts                  # Redis client + caching
│   ├── tokens.ts                 # Verification tokens
│   └── utils.ts                  # Utility functions
└── store/
    └── dashboard.ts              # Zustand store
prisma/
├── schema.prisma                 # Database schema
└── seed.ts                       # Feed source seeder
```

## News Sources

Pre-seeded with these RSS feeds:

| Source | Category |
|---|---|
| AP News | General |
| Reuters | General |
| BBC World | World |
| NPR News | General |
| The Guardian | World |
| Al Jazeera | World |
| TechCrunch | Tech |
| Hacker News | Tech |
| The Verge | Tech |
| Ars Technica | Tech |

## License

MIT
