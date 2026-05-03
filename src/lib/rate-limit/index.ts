// Single shared rate limiter. Module-level singleton so all routes/middleware
// share state inside the same process.

import { MemoryRateLimiter } from "@/lib/rate-limit/memory";
import type { RateLimiter } from "@/lib/rate-limit/driver";

const _rl: RateLimiter = new MemoryRateLimiter();

export const rateLimiter = _rl;
export type { RateLimit, RateLimitResult, RateLimiter } from "@/lib/rate-limit/driver";

// Per-route policy. Numbers are per IP per window. Per-user policies stay in
// the DB-backed login-throttle and feature-specific guards.
export const RL_POLICIES = {
  // /api/auth/callback/credentials et al — keep low to slow brute force. Our
  // login-throttle module also enforces per-email lockout in the DB.
  authPost: { max: 20, windowMs: 60_000 } as const,
  // File uploads can be heavy; cap aggressively per IP.
  fileUpload: { max: 30, windowMs: 60 * 60_000 } as const,
  // General API mutations.
  apiMutation: { max: 600, windowMs: 60_000 } as const,
} as const;
