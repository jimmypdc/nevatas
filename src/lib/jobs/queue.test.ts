import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nextBackoff } from "@/lib/jobs/queue";

describe("nextBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  function deltaSec(d: Date): number {
    return Math.round((d.getTime() - Date.now()) / 1000);
  }

  it("first failure → 30s delay", () => {
    expect(deltaSec(nextBackoff(1))).toBe(30);
  });

  it("escalates by 4x each attempt: 30s, 2m, 8m, 32m, 2h", () => {
    expect(deltaSec(nextBackoff(1))).toBe(30);
    expect(deltaSec(nextBackoff(2))).toBe(120);
    expect(deltaSec(nextBackoff(3))).toBe(480);
    expect(deltaSec(nextBackoff(4))).toBe(1920);
    expect(deltaSec(nextBackoff(5))).toBe(7200);
  });

  it("caps at 2h regardless of attempt count", () => {
    expect(deltaSec(nextBackoff(10))).toBe(7200);
    expect(deltaSec(nextBackoff(100))).toBe(7200);
  });
});
