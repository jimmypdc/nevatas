import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { signOAuthState, verifyOAuthState } from "@/lib/integrations/oauth-state";

const PAYLOAD = {
  connectionId: "conn-001",
  userId: "u-001",
  organizationId: "org-001",
  companyId: "co-001",
  provider: "paycor" as const,
};

describe("signOAuthState + verifyOAuthState", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "x".repeat(32);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("round-trips the payload", () => {
    const token = signOAuthState(PAYLOAD);
    const v = verifyOAuthState(token, "paycor");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.payload.connectionId).toBe("conn-001");
    expect(v.payload.userId).toBe("u-001");
    expect(v.payload.organizationId).toBe("org-001");
    expect(v.payload.companyId).toBe("co-001");
    expect(v.payload.provider).toBe("paycor");
    expect(v.payload.exp).toBeGreaterThan(v.payload.iat);
    expect(v.payload.nonce).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects a tampered payload", () => {
    const token = signOAuthState(PAYLOAD);
    // Flip a character in the body half (before the dot).
    const dot = token.indexOf(".");
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const tamperedBody =
      body.slice(0, 5) + (body[5] === "A" ? "B" : "A") + body.slice(6);
    const v = verifyOAuthState(`${tamperedBody}.${sig}`, "paycor");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("bad_signature");
  });

  it("rejects an expired token", () => {
    const token = signOAuthState(PAYLOAD);
    vi.setSystemTime(new Date("2026-05-03T00:11:00Z")); // 11 min later — past 10-min TTL
    const v = verifyOAuthState(token, "paycor");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("expired");
  });

  it("rejects when verifying against the wrong provider", () => {
    const token = signOAuthState(PAYLOAD);
    const v = verifyOAuthState(token, "adp");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("wrong_provider");
  });

  it("rejects malformed input (no dot, garbage)", () => {
    expect(verifyOAuthState("no-dot-here", "paycor").ok).toBe(false);
    expect(verifyOAuthState("garbage.garbage", "paycor").ok).toBe(false);
  });

  it("two consecutive signs of the same payload produce different tokens (nonce)", () => {
    const a = signOAuthState(PAYLOAD);
    const b = signOAuthState(PAYLOAD);
    expect(a).not.toBe(b);
  });
});
