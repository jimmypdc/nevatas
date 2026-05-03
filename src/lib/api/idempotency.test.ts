import { describe, expect, it } from "vitest";

import { buildScope, computeBodyHash } from "@/lib/api/idempotency";

describe("computeBodyHash", () => {
  it("is deterministic for identical bodies", () => {
    expect(computeBodyHash('{"a":1}')).toBe(computeBodyHash('{"a":1}'));
  });

  it("differs for different bodies", () => {
    expect(computeBodyHash('{"a":1}')).not.toBe(computeBodyHash('{"a":2}'));
  });

  it("differs even for whitespace-different bodies — sender controls canonical form", () => {
    // We intentionally hash the raw bytes; the client's serializer must be
    // deterministic. This is the same contract Stripe documents.
    expect(computeBodyHash('{"a":1}')).not.toBe(computeBodyHash('{ "a": 1 }'));
  });
});

describe("buildScope", () => {
  it("includes user id, method, and path", () => {
    expect(buildScope({ userId: "u1", method: "POST", pathname: "/api/x" })).toBe(
      "u1:POST:/api/x",
    );
  });

  it("falls back to anon when no userId is supplied", () => {
    expect(buildScope({ method: "POST", pathname: "/api/x" })).toBe("anon:POST:/api/x");
  });

  it("scopes are distinct across actor + route + method", () => {
    const a = buildScope({ userId: "u1", method: "POST", pathname: "/api/x" });
    const b = buildScope({ userId: "u2", method: "POST", pathname: "/api/x" });
    const c = buildScope({ userId: "u1", method: "POST", pathname: "/api/y" });
    const d = buildScope({ userId: "u1", method: "DELETE", pathname: "/api/x" });
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});
