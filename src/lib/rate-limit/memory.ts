// In-memory fixed-window rate limiter. Edge-runtime compatible (no Node
// APIs). Dev/single-instance only — use Redis or Upstash in production.
//
// Fixed-window has a known burst-at-boundary weakness; for our use case
// (login throttle, upload throttle, mutation throttle) it's good enough as a
// first gate. The DB-backed login-throttle layer catches anything that
// slips through.

import type { RateLimit, RateLimitResult, RateLimiter } from "@/lib/rate-limit/driver";

type Bucket = { count: number; windowStart: number };

export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();
  // Cap the size so a flood of unique keys can't OOM us. When we exceed
  // MAX_KEYS, a sweep removes anything older than 2x the largest window.
  private readonly MAX_KEYS = 50_000;

  async check(key: string, limit: RateLimit): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.buckets.get(key);

    let bucket: Bucket;
    if (!existing || now - existing.windowStart >= limit.windowMs) {
      bucket = { count: 0, windowStart: now };
      this.buckets.set(key, bucket);
    } else {
      bucket = existing;
    }

    bucket.count += 1;
    const allowed = bucket.count <= limit.max;
    const resetAt = bucket.windowStart + limit.windowMs;

    if (this.buckets.size > this.MAX_KEYS) {
      this.sweep(now, limit.windowMs * 2);
    }

    return {
      allowed,
      limit: limit.max,
      remaining: Math.max(0, limit.max - bucket.count),
      resetAt,
    };
  }

  private sweep(now: number, ttlMs: number): void {
    for (const [k, b] of this.buckets) {
      if (now - b.windowStart > ttlMs) this.buckets.delete(k);
    }
  }
}
