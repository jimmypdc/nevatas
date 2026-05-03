// Pure TOTP implementation per RFC 6238 (HMAC-SHA1, 30s period, 6 digits).
// Compatible with Google Authenticator, Authy, 1Password, Apple Passwords, and
// other RFC 6238 clients.
//
// We deliberately avoid pulling in a third-party library: it's ~100 lines of
// straightforward code, easier to audit, and zero supply-chain risk for a
// security-critical primitive.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_DEFAULTS = {
  period: 30,
  digits: 6,
  // ±1 step tolerance: accommodates ≤30s clock skew either direction.
  window: 1,
} as const;

export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(s: string): Buffer {
  const cleaned = s.replace(/=+$/g, "").toUpperCase().replace(/\s+/g, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCode(
  secretBase32: string,
  options?: { time?: number; period?: number; digits?: number },
): string {
  const period = options?.period ?? TOTP_DEFAULTS.period;
  const digits = options?.digits ?? TOTP_DEFAULTS.digits;
  const time = options?.time ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(time / period);

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secretBase32);
  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function verifyTotp(
  secretBase32: string,
  supplied: string,
  options?: { period?: number; digits?: number; window?: number; time?: number },
): boolean {
  const window = options?.window ?? TOTP_DEFAULTS.window;
  const period = options?.period ?? TOTP_DEFAULTS.period;
  const digits = options?.digits ?? TOTP_DEFAULTS.digits;
  const cleaned = supplied.replace(/\s+/g, "");
  if (!/^\d+$/.test(cleaned) || cleaned.length !== digits) return false;
  const now = options?.time ?? Math.floor(Date.now() / 1000);
  for (let dt = -window; dt <= window; dt++) {
    const expected = totpCode(secretBase32, { time: now + dt * period, period, digits });
    if (timingSafeEqualString(expected, cleaned)) return true;
  }
  return false;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function otpauthUri(params: {
  secretBase32: string;
  issuer: string;
  account: string;
  digits?: number;
  period?: number;
}): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const search = new URLSearchParams({
    secret: params.secretBase32,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(params.digits ?? TOTP_DEFAULTS.digits),
    period: String(params.period ?? TOTP_DEFAULTS.period),
  });
  return `otpauth://totp/${label}?${search.toString()}`;
}

// Recovery codes: 16 base32 chars, 4-4-4-4 grouped for readability. ~80 bits
// entropy. The plaintext is shown to the user exactly once; only Argon2id
// hashes are persisted.
export function generateRecoveryCode(): string {
  const raw = base32Encode(randomBytes(10)).slice(0, 16);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]+/g, "").toUpperCase();
}
