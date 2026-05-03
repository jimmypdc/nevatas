// Login attempt logging + lockout. Called from the NextAuth Credentials
// authorize() callback before and after the password check.
//
// Thresholds (tunable per deployment):
//   - 5 failed attempts on a single email in 15 min  => account lock 15 min
//   - 20 failed attempts from a single IP in 15 min  => IP throttle (reject)
//
// Successful login resets the email's failure counter.

import { db } from "@/lib/db";

export type LoginOutcome =
  | "succeeded"
  | "bad_password"
  | "bad_mfa"
  | "mfa_required"
  | "unknown_user"
  | "locked"
  | "throttled"
  | "disabled";

export type ThrottleContext = {
  emailLower: string;
  ipAddress?: string;
  userAgent?: string;
};

const FAILURE_WINDOW_MS = 15 * 60_000;
const EMAIL_LOCK_THRESHOLD = 5;
const EMAIL_LOCK_DURATION_MS = 15 * 60_000;
const IP_THROTTLE_THRESHOLD = 20;

export type PreCheckResult =
  | { allow: true }
  | { allow: false; outcome: "locked" | "throttled" | "disabled"; reason: string };

// Check whether this attempt should be allowed before we even verify the
// password. Performs no mutations.
export async function preLoginCheck(ctx: ThrottleContext): Promise<PreCheckResult> {
  const since = new Date(Date.now() - FAILURE_WINDOW_MS);

  if (ctx.ipAddress) {
    const ipFails = await db.loginAttempt.count({
      where: {
        ipAddress: ctx.ipAddress,
        outcome: { in: ["bad_password", "bad_mfa", "mfa_required", "unknown_user", "locked", "throttled"] },
        createdAt: { gte: since },
      },
    });
    if (ipFails >= IP_THROTTLE_THRESHOLD) {
      return {
        allow: false,
        outcome: "throttled",
        reason: `${ipFails} recent failures from this IP`,
      };
    }
  }

  const user = await db.user.findUnique({
    where: { email: ctx.emailLower },
    select: { id: true, status: true, lockedUntil: true },
  });
  if (!user) {
    // Don't disclose; caller will treat as bad_password.
    return { allow: true };
  }
  if (user.status !== "active") {
    return { allow: false, outcome: "disabled", reason: "Account disabled" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { allow: false, outcome: "locked", reason: "Account locked" };
  }

  return { allow: true };
}

// Record an attempt. Updates user counters on success/failure. Logs the
// LoginAttempt row in any case (append-only).
export async function recordLoginAttempt(
  ctx: ThrottleContext,
  outcome: LoginOutcome,
  reason?: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { email: ctx.emailLower },
    select: { id: true, failedLoginCount: true },
  });

  await db.loginAttempt.create({
    data: {
      emailLower: ctx.emailLower,
      userId: user?.id ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      outcome,
      reason: reason ?? null,
    },
  });

  if (!user) return;

  if (outcome === "succeeded") {
    if (user.failedLoginCount > 0) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null },
      });
    }
    return;
  }

  if (outcome === "bad_password" || outcome === "bad_mfa" || outcome === "mfa_required") {
    const next = user.failedLoginCount + 1;
    const shouldLock = next >= EMAIL_LOCK_THRESHOLD;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: next,
        lastFailedLoginAt: new Date(),
        lockedUntil: shouldLock ? new Date(Date.now() + EMAIL_LOCK_DURATION_MS) : undefined,
      },
    });
  }
}
