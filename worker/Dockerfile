# ─── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace root files needed for Prisma
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

# Copy worker package files
COPY worker/package.json worker/pnpm-lock.yaml* ./worker/

# Install worker dependencies
WORKDIR /app/worker
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Generate Prisma client
WORKDIR /app
RUN cd worker && npx prisma generate --schema=../prisma/schema.prisma

# Copy worker source
COPY worker/ ./worker/

# Build TypeScript
WORKDIR /app/worker
RUN pnpm build

# ─── Stage 2: Run ───────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built output and dependencies
COPY --from=builder /app/worker/dist ./dist
COPY --from=builder /app/worker/node_modules ./node_modules
COPY --from=builder /app/worker/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Environment
ENV NODE_ENV=production

# Health check — process should always be running
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -x node || exit 1

CMD ["node", "dist/index.js"]
