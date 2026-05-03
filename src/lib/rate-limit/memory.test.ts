import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryRateLimiter } from "@/lib/rate-limit/memory";

describe("MemoryRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to max requests in a window", async () => {
    const rl = new MemoryRateLimiter();
    const limit = { max: 3, windowMs: 60_000 };
    expect((await rl.check("k", limit)).allowed).toBe(true);
    expect((await rl.check("k", limit)).allowed).toBe(true);
    expect((await rl.check("k", limit)).allowed).toBe(true);
    expect((await rl.check("k", limit)).allowed).toBe(false);
  });

  it("decrements remaining on each call", async () => {
    const rl = new MemoryRateLimiter();
    const limit = { max: 3, windowMs: 60_000 };
    expect((await rl.check("k", limit)).remaining).toBe(2);
    expect((await rl.check("k", limit)).remaining).toBe(1);
    expect((await rl.check("k", limit)).remaining).toBe(0);
    expect((await rl.check("k", limit)).remaining).toBe(0);
  });

  it("resets after the window elapses", async () => {
    const rl = new MemoryRateLimiter();
    const limit = { max: 1, windowMs: 1_000 };
    expect((await rl.check("k", limit)).allowed).toBe(true);
    expect((await rl.check("k", limit)).allowed).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect((await rl.check("k", limit)).allowed).toBe(true);
  });

  it("scopes per key", async () => {
    const rl = new MemoryRateLimiter();
    const limit = { max: 1, windowMs: 60_000 };
    expect((await rl.check("a", limit)).allowed).toBe(true);
    expect((await rl.check("b", limit)).allowed).toBe(true);
    expect((await rl.check("a", limit)).allowed).toBe(false);
    expect((await rl.check("b", limit)).allowed).toBe(false);
  });
});
