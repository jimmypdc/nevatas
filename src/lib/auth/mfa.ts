// MFA service. Three lifecycle phases:
//
//   1. begin    — generate a fresh secret, persist it encrypted on the user
//                 with mfaEnabled=false, return the otpauth URI to display.
//   2. complete — verify the user's first TOTP code against the stored secret;
//                 if it matches, flip mfaEnabled=true, mfaEnrolledAt=now, and
//                 issue a fresh batch of recovery codes.
//   3. disable  — clear secret + recovery codes after re-verifying password
//                 (caller's responsibility).
//
// Recovery code use at login goes through verifyAndConsumeRecoveryCode below.

import { db } from "@/lib/db";
import { encryptField, decryptField } from "@/lib/crypto/encryption";
import { hashPassword, verifyPassword } from "@/lib/crypto/hashing";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { validationError } from "@/lib/errors";
import {
  generateRecoveryCode,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "@/lib/auth/totp";

const ISSUER = "Nevatas";
const RECOVERY_CODE_COUNT = 10;

export type BeginEnrollmentResult = {
  otpauthUri: string;
  secret: string; // base32; the user types this if their authenticator can't scan
};

// Begin enrollment. Idempotent: re-running before completion overwrites the
// pending secret. Existing recovery codes are not touched.
export async function beginMfaEnrollment(params: {
  organizationId: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}): Promise<BeginEnrollmentResult> {
  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: { email: true, mfaEnabled: true },
  });
  if (!user) throw validationError("User not found");
  if (user.mfaEnabled) throw validationError("MFA is already enabled for this account");

  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: params.userId },
    data: { mfaSecretEncrypted: await encryptField(secret) },
  });

  await writeAudit({
    organizationId: params.organizationId,
    actorUserId: params.userId,
    action: AUDIT_ACTIONS.mfaEnrollmentBegan,
    entityType: "user",
    entityId: params.userId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    requestId: params.requestId,
  });

  return {
    otpauthUri: otpauthUri({ issuer: ISSUER, account: user.email, secretBase32: secret }),
    secret,
  };
}

export async function completeMfaEnrollment(params: {
  organizationId: string;
  userId: string;
  code: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}): Promise<{ recoveryCodes: string[] }> {
  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: { mfaSecretEncrypted: true, mfaEnabled: true },
  });
  if (!user || !user.mfaSecretEncrypted) {
    throw validationError("No MFA enrollment in progress; call begin first");
  }
  if (user.mfaEnabled) throw validationError("MFA is already enabled");

  const secret = await decryptField(user.mfaSecretEncrypted);
  if (!verifyTotp(secret, params.code)) {
    throw validationError("Verification code is incorrect");
  }

  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = generateRecoveryCode();
    plaintext.push(code);
    hashes.push(await hashPassword(normalizeRecoveryCode(code)));
  }

  await db.$transaction(async (tx) => {
    // Wipe any pre-existing recovery codes (e.g. from a prior MFA cycle on
    // this account that was disabled).
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: params.userId } });
    await tx.mfaRecoveryCode.createMany({
      data: hashes.map((codeHash) => ({ userId: params.userId, codeHash })),
    });
    await tx.user.update({
      where: { id: params.userId },
      data: {
        mfaEnabled: true,
        mfaEnrolledAt: new Date(),
      },
    });

    await writeAudit(
      {
        organizationId: params.organizationId,
        actorUserId: params.userId,
        action: AUDIT_ACTIONS.mfaEnrolled,
        entityType: "user",
        entityId: params.userId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        requestId: params.requestId,
      },
      tx,
    );
  });

  return { recoveryCodes: plaintext };
}

// Disable MFA. The caller must have already re-verified the user's password
// (this service does not — keep the password check at the API/UI boundary so
// the same flow can be reused for "disable on behalf of user" admin paths
// once those exist).
export async function disableMfa(params: {
  organizationId: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: params.userId },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaEnrolledAt: null,
      },
    });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: params.userId } });

    await writeAudit(
      {
        organizationId: params.organizationId,
        actorUserId: params.userId,
        action: AUDIT_ACTIONS.mfaDisabled,
        entityType: "user",
        entityId: params.userId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        requestId: params.requestId,
      },
      tx,
    );
  });
}

// Verify a TOTP code against the user's stored secret. Returns false if the
// user has no MFA enabled, no secret, or the code is invalid.
export async function verifyTotpForUser(userId: string, code: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true, mfaSecretEncrypted: true },
  });
  if (!user || !user.mfaEnabled || !user.mfaSecretEncrypted) return false;
  const secret = await decryptField(user.mfaSecretEncrypted);
  return verifyTotp(secret, code);
}

// Verify and consume a recovery code. Returns true if a previously-unused
// code matches and was consumed; false otherwise.
export async function verifyAndConsumeRecoveryCode(
  userId: string,
  rawCode: string,
): Promise<boolean> {
  const supplied = normalizeRecoveryCode(rawCode);
  if (supplied.length < 8) return false;

  const candidates = await db.mfaRecoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  for (const c of candidates) {
    if (await verifyPassword(c.codeHash, supplied)) {
      // Race-safe consume: only mark used if still unused.
      const result = await db.mfaRecoveryCode.updateMany({
        where: { id: c.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return result.count === 1;
    }
  }
  return false;
}
