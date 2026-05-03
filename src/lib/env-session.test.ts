// Verifies the session-related env values coerce correctly and the
// defaults align with what auth.ts and the idle watcher rely on.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUIRED = {
  AUTH_SECRET: "x".repeat(32),
  DATABASE_URL: "postgresql://placeholder/db",
  FIELD_ENCRYPTION_KEY: Buffer.from("y".repeat(32)).toString("base64"),
};

describe("session env values", () => {
  const original: Record<string, string | undefined> = {};
  const TOUCH = [
    "AUTH_SECRET",
    "DATABASE_URL",
    "FIELD_ENCRYPTION_KEY",
    "SESSION_MAX_AGE_HOURS",
    "SESSION_UPDATE_AGE_MINUTES",
    "SESSION_IDLE_TIMEOUT_MINUTES",
    "SESSION_IDLE_WARNING_SECONDS",
  ];

  beforeEach(() => {
    for (const k of TOUCH) original[k] = process.env[k];
    for (const [k, v] of Object.entries(REQUIRED)) process.env[k] = v;
    delete process.env.SESSION_MAX_AGE_HOURS;
    delete process.env.SESSION_UPDATE_AGE_MINUTES;
    delete process.env.SESSION_IDLE_TIMEOUT_MINUTES;
    delete process.env.SESSION_IDLE_WARNING_SECONDS;
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of TOUCH) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
    vi.resetModules();
  });

  it("supplies the documented defaults", async () => {
    const mod = await import("@/lib/env");
    const e = mod.env();
    expect(e.SESSION_MAX_AGE_HOURS).toBe(8);
    expect(e.SESSION_UPDATE_AGE_MINUTES).toBe(30);
    expect(e.SESSION_IDLE_TIMEOUT_MINUTES).toBe(15);
    expect(e.SESSION_IDLE_WARNING_SECONDS).toBe(30);
  });

  it("coerces numeric strings supplied via env", async () => {
    process.env.SESSION_MAX_AGE_HOURS = "24";
    process.env.SESSION_IDLE_TIMEOUT_MINUTES = "5";
    const mod = await import("@/lib/env");
    const e = mod.env();
    expect(e.SESSION_MAX_AGE_HOURS).toBe(24);
    expect(e.SESSION_IDLE_TIMEOUT_MINUTES).toBe(5);
  });

  it("rejects values outside the documented ranges", async () => {
    process.env.SESSION_MAX_AGE_HOURS = "10000"; // > 720 cap
    const mod = await import("@/lib/env");
    expect(() => mod.env()).toThrow();
  });
});
