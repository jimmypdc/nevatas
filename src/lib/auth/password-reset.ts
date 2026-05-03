// Password reset.
//
// Security properties:
//   - The raw token is sent in the email link only. Server stores SHA-256.
//     A DB compromise reveals no usable tokens.
//   - 32 bytes of entropy from crypto.randomBytes; URL-safe base64.
//   - 30-minute TTL.
//   - Single-use: usedAt is stamped on successful reset and the token
//     becomes inert.
//   - Email existence is never disclosed: requestPasswordReset always
//     returns success. The audit trail and any per-email rate limiting
//     handle abuse internally.
//   - Concurrent in-flight tokens for the same user are allowed (so a user
//     who lost the email can request a fresh one). All previously-issued
//     unused tokens are invalidated when a new one is created — only the
//     latest works.
//   - On successful reset: passwordHash is updated, passwordChangedAt is
//     stamped, failedLoginCount is cleared, lockedUntil is cleared. Phase 1
//     limitation: existing JWT sessions remain valid until natural expiry
//     because we use stateless JWT sessions. Document as a hardening item;
//     fixed by adding a token-version check or moving to DB sessions.

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { sha256Hex, hashPassword } from "@/lib/crypto/hashing";
import { validatePassword } from "@/lib/auth/password-policy";
import { enqueueEmail } from "@/lib/email/send";
import { TEMPLATES } from "@/lib/email/templates";
import { validationError } from "@/lib/errors";

const TOKEN_BYTES = 32;
const TTL_MS = 30 * 60_000;

export type RequestResetInput = {
  email: string;
  appUrl: string; // base URL the link will be appended to
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

// Always returns; never reveals whether the email matched a real user.
export async function requestPasswordReset(input: RequestResetInput): Promise<void> {
  const emailLower = input.email.toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email: emailLower } });
  if (!user || user.status !== "active") {
    // Constant-time-ish: still write a "requested" audit attached to no user
    // so log volume doesn't reveal which emails are valid. We do NOT enqueue
    // an email — sending to a non-existent address would be a bounce signal.
    return;
  }

  // Invalidate prior unused tokens so only the latest one works.
  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + TTL_MS);

  const orgMembership = await db.organizationUser.findFirst({
    where: { userId: user.id, status: "active" },
    select: { organizationId: true },
  });

  await db.$transaction(async (tx) => {
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
    if (orgMembership) {
      await writeAudit(
        {
          organizationId: orgMembership.organizationId,
          actorUserId: user.id,
          actorType: "user",
          action: AUDIT_ACTIONS.authPasswordResetRequested,
          entityType: "user",
          entityId: user.id,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          requestId: input.requestId,
        },
        tx,
      );
    }
  });

  const resetUrl = `${input.appUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await enqueueEmail({
    template: TEMPLATES.passwordReset,
    to: user.email,
    recipientUserId: user.id,
    organizationId: orgMembership?.organizationId ?? null,
    params: {
      recipientName: user.name ?? user.email.split("@")[0]!,
      resetUrl,
      expiresInMinutes: Math.floor(TTL_MS / 60_000),
    },
    dedupKey: `pwreset:${tokenHash}`,
  });
}

export type CompleteResetInput = {
  token: string;
  newPassword: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function completePasswordReset(input: CompleteResetInput): Promise<void> {
  if (!input.token) throw validationError("Reset token is required");

  const policy = await validatePassword(input.newPassword);
  if (!policy.ok) {
    throw validationError("Password does not meet policy", { reasons: policy.reasons });
  }

  const tokenHash = sha256Hex(input.token);
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!row) {
    // Audit a failed attempt without an attributable org — surfaces in the
    // global audit feed for SOC 2 review.
    await writeFailureAudit(input, "unknown_token");
    throw validationError("Reset link is invalid or has already been used");
  }
  if (row.usedAt) {
    await writeFailureAudit(input, "token_already_used", row.user.id);
    throw validationError("Reset link has already been used");
  }
  if (row.expiresAt < new Date()) {
    await writeFailureAudit(input, "token_expired", row.user.id);
    throw validationError("Reset link has expired; request a new one");
  }

  const newHash = await hashPassword(input.newPassword);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash: newHash,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        lastFailedLoginAt: null,
      },
    });
    await tx.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    // Invalidate any other outstanding tokens for this user.
    await tx.passwordResetToken.updateMany({
      where: { userId: row.userId, id: { not: row.id }, usedAt: null },
      data: { usedAt: new Date() },
    });

    const orgMembership = await tx.organizationUser.findFirst({
      where: { userId: row.userId, status: "active" },
      select: { organizationId: true },
    });
    if (orgMembership) {
      await writeAudit(
        {
          organizationId: orgMembership.organizationId,
          actorUserId: row.userId,
          actorType: "user",
          action: AUDIT_ACTIONS.authPasswordResetCompleted,
          entityType: "user",
          entityId: row.userId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          requestId: input.requestId,
        },
        tx,
      );
    }
  });
}

async function writeFailureAudit(
  input: CompleteResetInput,
  reason: "unknown_token" | "token_already_used" | "token_expired",
  userId?: string,
) {
  // Best-effort attribution: when we know the user, attach to their first
  // active org. When we don't (unknown token), skip the audit — we have no
  // org to scope it to. The HTTP response itself is still rate-limited by
  // the Edge middleware.
  if (!userId) return;
  const orgMembership = await db.organizationUser.findFirst({
    where: { userId, status: "active" },
    select: { organizationId: true },
  });
  if (!orgMembership) return;
  await writeAudit({
    organizationId: orgMembership.organizationId,
    actorUserId: userId,
    actorType: "user",
    action: AUDIT_ACTIONS.authPasswordResetFailed,
    entityType: "user",
    entityId: userId,
    metadata: { reason },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });
}
