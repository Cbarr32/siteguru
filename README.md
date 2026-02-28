# SiteGuru

A **personal unified command center** — one dashboard to manage Gmail, Calendar, GitHub, Spotify, Teams, Instagram, YouTube, weather, and news, powered by an AI agent sidekick.

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript 5.9 |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Database** | PostgreSQL + Prisma 7 ORM |
| **Caching** | Redis (ioredis) |
| **Auth** | NextAuth.js v5 (Google, GitHub, Spotify, Microsoft, Facebook) |
| **AI** | Anthropic Claude (via Vercel AI SDK) |
| **Grid** | react-grid-layout (drag & drop) |
| **Worker** | Node.js cron service (Railway) |

## Architecture

```text
┌────────────────────────────────────────────────────────────────┐
│                        VERCEL (Edge/Node)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Next.js 14 App Router                  │  │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────────────┐ │  │
│  │  │  Dashboard  │ │   Panels   │ │   Agent Sidekick     │ │  │
│  │  │  Grid (DnD) │ │  Weather   │ │   (Claude Opus 4)    │ │  │
│  │  │             │ │  News/RSS  │ │   Cmd+K palette      │ │  │
│  │  │             │ │  Gmail     │ │   Tool use           │ │  │
│  │  │             │ │  Calendar  │ │   Conversations      │ │  │
│  │  │             │ │  GitHub    │ │                      │ │  │
│  │  │             │ │  Spotify   │ └──────────────────────┘ │  │
│  │  │             │ │  Teams     │                          │  │
│  │  │             │ │  YouTube   │  ┌─────────────────────┐ │  │
│  │  │             │ │  Instagram │  │   API Routes        │ │  │
│  │  └────────────┘ └────────────┘  │   /api/agent/chat   │ │  │
│  │                                  │   /api/gmail/*      │ │  │
│  │  ┌──────────────────────────┐   │   /api/calendar/*   │ │  │
│  │  │      Sidebar + Nav       │   │   /api/github/*     │ │  │
│  │  └──────────────────────────┘   │   /api/spotify/*    │ │  │
│  │                                  └─────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────┬──────────────────────┬────────────────────┘
                     │                      │
        ┌────────────▼──────────┐  ┌───────▼──────────┐
        │   Railway PostgreSQL  │  │   Railway Redis   │
        │   (Prisma ORM)        │  │   (ioredis)       │
        └────────────▲──────────┘  └───────▲──────────┘
                     │                      │
        ┌────────────┴──────────────────────┴──────────┐
        │              Railway Worker                    │
        │  ┌────────────┐  ┌──────────────────────────┐ │
        │  │ token-      │  │ rss-poll (15 min)        │ │
        │  │ refresh     │  │ Fetch & cache feeds      │ │
        │  │ (15 min)    │  └──────────────────────────┘ │
        │  └────────────┘  ┌──────────────────────────┐  │
        │  ┌────────────┐  │ cache-warm (5 min)        │ │
        │  │ context-   │  │ Pre-warm panel data       │ │
        │  │ snapshot   │  └──────────────────────────┘  │
        │  │ (daily)    │                                 │
        │  └────────────┘                                 │
        └─────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- **Node.js** 20+
- **pnpm** (package manager)
- **PostgreSQL** (local or Railway)
- **Redis** (optional — app degrades gracefully)

### Local Development

```bash
# 1. Clone the repo
git clone https://github.com/Cbarr32/siteguru.git
cd siteguru

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your database URL, API keys, etc.

# 4. Push the Prisma schema to your database
pnpm db:push

# 5. Seed default RSS feed sources
pnpm db:seed

# 6. Start the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

### Worker (optional for local dev)

```bash
# In a separate terminal — runs the cron worker locally
cd worker
pnpm install
pnpm dev
```

## Deployment

### Frontend — Vercel

1. Import the repo on [Vercel](https://vercel.com/new)
2. Set all environment variables from `.env.example`
3. Deploy — Vercel auto-detects Next.js

The agent chat route (`/api/agent/chat`) is configured with a 60-second max duration in `vercel.json`.

### Backend — Railway

1. Create a new project on [Railway](https://railway.app)
2. Add a **PostgreSQL** plugin → copy the `DATABASE_URL`
3. Add a **Redis** plugin → copy the `REDIS_URL`
4. Add a **Worker** service pointing to `worker/Dockerfile`
5. Set all environment variables on each service

The worker runs four cron jobs:

| Job | Schedule | Description |
| --- | --- | --- |
| `token-refresh` | Every 15 min | Rotates expiring OAuth tokens |
| `rss-poll` | Every 15 min | Fetches & caches RSS feeds |
| `cache-warm` | Every 5 min | Pre-warms panel data caches |
| `context-snapshot` | Daily 23:59 | Builds agent context snapshots |

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_URL` | Yes | App URL (`http://localhost:3000` for dev) |
| `NEXTAUTH_SECRET` | Yes | Session encryption secret |
| `REDIS_URL` | No | Redis connection string |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth client secret |
| `SPOTIFY_CLIENT_ID` | No | Spotify OAuth client ID |
| `SPOTIFY_CLIENT_SECRET` | No | Spotify OAuth client secret |
| `MICROSOFT_ENTRA_ID_CLIENT_ID` | No | Microsoft Entra (Azure AD) client ID |
| `MICROSOFT_ENTRA_ID_CLIENT_SECRET` | No | Microsoft Entra client secret |
| `FACEBOOK_CLIENT_ID` | No | Facebook/Instagram OAuth client ID |
| `FACEBOOK_CLIENT_SECRET` | No | Facebook/Instagram OAuth client secret |
| `OPENWEATHER_API_KEY` | No | OpenWeatherMap API key |
| `ANTHROPIC_API_KEY` | Yes | Anthropic Claude API key |
| `DEFAULT_CITY` | No | Default weather city (defaults to Minneapolis) |

## Project Structure

```text
src/
├── app/
│   ├── api/              # API routes (agent, gmail, calendar, github, etc.)
│   ├── globals.css
│   ├── layout.tsx        # Root layout (AgentProvider, CommandPalette)
│   └── page.tsx          # Dashboard page
├── components/
│   ├── agent/            # AI agent UI (panel, messages, command palette)
│   ├── layout/           # Dashboard grid, sidebar
│   ├── panels/           # Service panels (weather, news, gmail, etc.)
│   └── ui/               # shadcn/ui primitives
├── hooks/                # React hooks (useAgent, useSpotifyPlayer, etc.)
├── lib/
│   ├── agent/            # Agent tools, system prompt, context builder
│   ├── providers/        # Service API wrappers (gmail, github, spotify, etc.)
│   ├── db.ts             # Prisma client
│   └── redis.ts          # Redis client + cache helper
└── store/                # Zustand stores
worker/
├── index.ts              # Cron scheduler entry point
├── jobs/                 # Background jobs (token-refresh, rss-poll, etc.)
├── lib/                  # Worker's own db + redis clients
├── Dockerfile            # Multi-stage Docker build
└── package.json
prisma/
├── schema.prisma         # Database schema
└── seed.ts               # Default RSS feed seeder
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm type-check` | TypeScript type check (no emit) |
| `pnpm db:push` | Push Prisma schema to database |
| `pnpm db:migrate` | Create Prisma migration |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:studio` | Open Prisma Studio GUI |
| `pnpm db:seed` | Seed database with default feeds |
| `pnpm worker:dev` | Run worker locally (dev mode) |
| `pnpm worker:build` | Build worker TypeScript |

## License

MIT
