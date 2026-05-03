// Rate limiter interface. The Edge-compatible in-memory implementation is
// fine for single-instance dev. Production deploys should swap in a Redis-
// backed driver (e.g. @upstash/ratelimit) — keep the interface stable.

export type RateLimit = { max: number; windowMs: number };

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // ms epoch
};

export interface RateLimiter {
  check(key: string, limit: RateLimit): Promise<RateLimitResult>;
}
