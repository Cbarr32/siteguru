/**
 * worker/lib/redis.ts
 * ───────────────────
 * Redis client for the worker process.
 * Mirrors src/lib/redis.ts but without Next.js global caching.
 */

import Redis from "ioredis";

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (redis) return redis;

  const url = process.env.REDIS_URL || "redis://localhost:6379";

  redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    console.error("[worker:redis] connection error:", err.message);
  });

  redis.on("connect", () => {
    console.log("[worker:redis] connected");
  });

  return redis;
}

/**
 * Cache helper: get from cache or fetch and store.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  const client = getRedis();

  try {
    const cached = await client.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Redis unavailable, fall through to fetcher
  }

  const data = await fetcher();

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(data));
  } catch {
    // Redis unavailable, continue without caching
  }

  return data;
}

export default getRedis;
