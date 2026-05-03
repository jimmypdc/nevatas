import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  base32Decode,
  base32Encode,
  generateRecoveryCode,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  totpCode,
  verifyTotp,
} from "@/lib/auth/totp";

describe("base32 round-trip", () => {
  it("encodes and decodes an arbitrary buffer", () => {
    const original = Buffer.from("the quick brown fox jumps over the lazy dog");
    const enc = base32Encode(original);
    const dec = base32Decode(enc);
    expect(dec.equals(original)).toBe(true);
  });

  it("uppercases and tolerates whitespace on decode", () => {
    expect(base32Decode("MZXW 6")).toEqual(base32Decode("MZXW6"));
  });

  it("rejects invalid characters", () => {
    expect(() => base32Decode("MZXW!")).toThrow();
  });
});

describe("RFC 6238 SHA-1 test vectors", () => {
  // The RFC 6238 spec defines a known SHA-1 secret of "12345678901234567890"
  // (ASCII). In base32 that is "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ".
  const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  // (time, expected 8-digit code from the RFC). We use 6 digits, taking the
  // last 6 of the published values.
  const cases: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];

  for (const [t, expected] of cases) {
    it(`matches at t=${t}`, () => {
      expect(totpCode(SECRET, { time: t })).toBe(expected);
    });
  }
});

describe("verifyTotp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const secret = generateTotpSecret();

  it("accepts the current code", () => {
    const code = totpCode(secret);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("accepts the previous step within the ±1 window", () => {
    const earlier = Math.floor(Date.now() / 1000) - 30;
    const code = totpCode(secret, { time: earlier });
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("rejects a code from outside the window", () => {
    const farPast = Math.floor(Date.now() / 1000) - 90;
    const code = totpCode(secret, { time: farPast });
    expect(verifyTotp(secret, code)).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(verifyTotp(secret, "12345")).toBe(false); // 5 digits
    expect(verifyTotp(secret, "12a456")).toBe(false); // non-digit
    expect(verifyTotp(secret, "")).toBe(false);
  });
});

describe("otpauthUri", () => {
  it("emits the canonical otpauth URI", () => {
    const uri = otpauthUri({ secretBase32: "ABC234", issuer: "Nevatas", account: "user@x.io" });
    expect(uri).toMatch(/^otpauth:\/\/totp\/Nevatas%3Auser%40x\.io\?/);
    expect(uri).toContain("secret=ABC234");
    expect(uri).toContain("issuer=Nevatas");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("recovery codes", () => {
  it("formats 16-char codes in 4 groups", () => {
    const c = generateRecoveryCode();
    expect(c).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  });

  it("normalizes to a comparable form", () => {
    expect(normalizeRecoveryCode(" abcd-efgh-1234-5678 ")).toBe("ABCDEFGH12345678");
  });
});
