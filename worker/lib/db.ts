/**
 * worker/lib/db.ts
 * ────────────────
 * Prisma client for the worker process.
 * Mirrors src/lib/db.ts but without Next.js global caching.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

let prisma: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (prisma) return prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({
    adapter,
    log: ["error"],
  });

  return prisma;
}

export default getDb;
