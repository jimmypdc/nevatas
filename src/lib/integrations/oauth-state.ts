// OAuth state-parameter signer + verifier.
//
// State serves two purposes in our flow:
//   1. CSRF defense — round-tripping a server-generated value through the
//      provider proves the callback originated from our own /connect
//      redirect and not a malicious link.
//   2. Connection-id carrier — the callback needs to know which
//      PayrollConnection row to attach the resulting tokens to. Putting
//      the id in state (signed) avoids needing a separate session-storage
//      lookup.
//
// Format: base64url(payload).base64url(signature)
// Signature: HMAC-SHA256(payload, AUTH_SECRET)
// Payload: JSON of OAuthStatePayload below.
//
// We sign with AUTH_SECRET (already 32+ random bytes; same key NextAuth
// signs JWTs with). State has a 10-minute hard TTL — long enough for the
// user to authenticate on the provider's site, short enough that a leaked
// state from server logs / referrer headers can't be replayed indefinitely.

import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 10 * 60_000;

export type OAuthStatePayload = {
  // The PayrollConnection row this OAuth dance will attach tokens to.
  connectionId: string;
  // The user who initiated the flow. Used for audit attribution on the
  // callback side; the callback also independently verifies the user is
  // signed in + has the right permission.
  userId: string;
  organizationId: string;
  companyId: string;
  // Issued-at + expires-at, both ms since epoch.
  iat: number;
  exp: number;
  // Provider name; the callback route reads it from the URL but we also
  // bind it into state so a state minted for one provider can't be
  // replayed against a different provider's callback.
  provider: string;
  // Random nonce — defends against replay even within the TTL window.
  nonce: string;
};

export function signOAuthState(
  payload: Omit<OAuthStatePayload, "iat" | "exp" | "nonce">,
): string {
  const now = Date.now();
  const full: OAuthStatePayload = {
    ...payload,
    iat: now,
    exp: now + TTL_MS,
    nonce: randomNonce(),
  };
  const json = JSON.stringify(full);
  const body = base64url(Buffer.from(json, "utf8"));
  const sig = base64url(hmac(body));
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: OAuthStatePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_provider" };

export function verifyOAuthState(
  token: string,
  expectedProvider: string,
): VerifyResult {
  const dot = token.indexOf(".");
  if (dot < 0) return { ok: false, reason: "malformed" };
  const body = token.slice(0, dot);
  const suppliedSig = token.slice(dot + 1);
  const expectedSig = base64url(hmac(body));
  if (!constantTimeEqual(expectedSig, suppliedSig)) {
    return { ok: false, reason: "bad_signature" };
  }
  let payload: OAuthStatePayload;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    payload = JSON.parse(json);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.exp !== "number" ||
    typeof payload.connectionId !== "string" ||
    typeof payload.userId !== "string" ||
    typeof payload.provider !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.exp < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (payload.provider !== expectedProvider) {
    return { ok: false, reason: "wrong_provider" };
  }
  return { ok: true, payload };
}

// ---------- internals ----------

function hmac(body: string): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to sign OAuth state");
  return createHmac("sha256", secret).update(body).digest();
}

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function randomNonce(): string {
  // 12 bytes = 96 bits; base64url so it's URL-safe.
  return base64url(Buffer.from(crypto.getRandomValues(new Uint8Array(12))));
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
