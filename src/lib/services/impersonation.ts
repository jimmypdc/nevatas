// Admin impersonation service.
//
// Lifecycle:
//
//   1. start  — Platform Super Admin POSTs { targetUserId, reason }. Service
//      validates: caller has platform.impersonate; target exists, is active,
//      is NOT another platform admin; admin isn't already impersonating.
//      Persists ImpersonationSession with 1-hour expiry, snapshots admin's
//      prior active org, switches active-org cookie to one of target's
//      memberships, sets nv_impersonation_id cookie, audits start on the
//      target's org with the admin in impersonatedBy.
//
//   2. requireActor() reads nv_impersonation_id, looks up the row, validates
//      adminUserId matches the current session, validates not expired/ended,
//      returns an actor whose userId is the targetUserId AND has impersonatedBy
//      set to the admin's user id. Sensitive permissions are stripped before
//      return — admins can debug but can't approve, submit, manage roles, etc.
//
//   3. stop  — admin clicks "Stop", or the row's expiresAt elapses, or the
//      admin signs out. Sets endedAt + endedReason, restores the admin's
//      prior active org, clears the cookie, audits stop.

import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { blockedByPolicy, forbidden, notFound, validationError } from "@/lib/errors";
import { ROLES } from "@/lib/rbac/roles";
import { setActiveOrganizationId } from "@/lib/session";

const IMPERSONATION_COOKIE = "nv_impersonation_id";
const TTL_MS = 60 * 60_000; // 1 hour

export type StartImpersonationInput = {
  adminUserId: string;
  adminPriorOrgId: string | null;
  targetUserId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function startImpersonation(input: StartImpersonationInput) {
  if (input.adminUserId === input.targetUserId) {
    throw validationError("Cannot impersonate yourself");
  }
  if (input.reason.trim().length < 10) {
    throw validationError("Impersonation reason must be at least 10 characters");
  }

  // Verify the target is real, active, and not another platform-level admin.
  const target = await db.user.findUnique({
    where: { id: input.targetUserId },
    select: {
      id: true,
      email: true,
      status: true,
      organizations: {
        where: { status: "active" },
        select: {
          organizationId: true,
          role: { select: { key: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!target) throw notFound("User");
  if (target.status !== "active") throw forbidden("Target user is not active");
  if (target.organizations.length === 0) {
    throw blockedByPolicy("Target user has no active organization memberships");
  }
  const isPlatformAdmin = target.organizations.some(
    (o) => o.role.key === ROLES.platformSuperAdmin || o.role.key === ROLES.platformSupportAdmin,
  );
  if (isPlatformAdmin) {
    throw blockedByPolicy("Cannot impersonate another platform administrator");
  }

  // Reject if the admin is already in an active impersonation.
  const existing = await db.impersonationSession.findFirst({
    where: { adminUserId: input.adminUserId, endedAt: null, expiresAt: { gt: new Date() } },
  });
  if (existing) {
    throw blockedByPolicy("End the current impersonation session before starting another");
  }

  const expiresAt = new Date(Date.now() + TTL_MS);
  const targetOrgId = target.organizations[0]!.organizationId;

  const session = await db.$transaction(async (tx) => {
    const created = await tx.impersonationSession.create({
      data: {
        adminUserId: input.adminUserId,
        adminPriorOrgId: input.adminPriorOrgId,
        targetUserId: input.targetUserId,
        reason: input.reason,
        expiresAt,
      },
    });

    // The "started" audit event lives on the TARGET'S org so that org's
    // admins see who entered their data. impersonatedBy carries the admin
    // for dual-attribution. actorUserId stays the target so org-scoped
    // queries still attribute to the affected org member.
    await writeAudit(
      {
        organizationId: targetOrgId,
        actorUserId: input.targetUserId,
        actorType: "user",
        impersonatedBy: input.adminUserId,
        action: AUDIT_ACTIONS.adminImpersonationStarted,
        entityType: "impersonation_session",
        entityId: created.id,
        metadata: {
          adminUserId: input.adminUserId,
          targetUserEmail: target.email,
          reason: input.reason,
          expiresAt: expiresAt.toISOString(),
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return created;
  });

  // Cookie + active-org switch happen after the row is committed so a
  // failed write never leaves a dangling cookie.
  await setActiveOrganizationId(targetOrgId);
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });

  return {
    id: session.id,
    targetUserId: input.targetUserId,
    targetOrganizationId: targetOrgId,
    expiresAt,
  };
}

export type StopImpersonationInput = {
  adminUserId: string;
  endedReason?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function stopImpersonation(input: StopImpersonationInput) {
  const cookieStore = await cookies();
  const id = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!id) return { ok: true, ended: false as const };

  const session = await db.impersonationSession.findUnique({ where: { id } });
  // Defensive: clear the cookie even if the row is missing or has the wrong
  // admin — leftover cookies shouldn't trap the admin in a phantom state.
  cookieStore.delete(IMPERSONATION_COOKIE);
  if (!session || session.adminUserId !== input.adminUserId) {
    return { ok: true, ended: false as const };
  }
  if (session.endedAt) return { ok: true, ended: false as const };

  await db.$transaction(async (tx) => {
    await tx.impersonationSession.update({
      where: { id: session.id },
      data: {
        endedAt: new Date(),
        endedReason: input.endedReason ?? "stopped",
      },
    });

    // Find the target's org for the audit attribution. We use the same
    // org chosen at start time when known, or the target's first active
    // membership otherwise.
    const targetMembership = await tx.organizationUser.findFirst({
      where: { userId: session.targetUserId, status: "active" },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true },
    });
    if (targetMembership) {
      await writeAudit(
        {
          organizationId: targetMembership.organizationId,
          actorUserId: session.targetUserId,
          actorType: "user",
          impersonatedBy: session.adminUserId,
          action: AUDIT_ACTIONS.adminImpersonationStopped,
          entityType: "impersonation_session",
          entityId: session.id,
          metadata: {
            adminUserId: session.adminUserId,
            durationMs: Date.now() - session.startedAt.getTime(),
            reason: input.endedReason ?? "stopped",
          },
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          requestId: input.requestId,
        },
        tx,
      );
    }
  });

  // Restore the admin's prior active org so they land back where they were.
  if (session.adminPriorOrgId) {
    await setActiveOrganizationId(session.adminPriorOrgId);
  }

  return { ok: true, ended: true as const };
}

// Reads the impersonation cookie, looks up the row, and returns the
// fully-validated session if-and-only-if the supplied currentUserId matches
// the session's adminUserId AND the session hasn't ended or expired.
//
// Called from requireActor(). Returns null when no impersonation is active
// (the most common case). Auto-clears the cookie when the row is invalid
// so a user with a stale cookie isn't stuck behind it.
export async function loadActiveImpersonation(currentUserId: string): Promise<{
  id: string;
  adminUserId: string;
  targetUserId: string;
  expiresAt: Date;
} | null> {
  const cookieStore = await cookies();
  const id = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!id) return null;
  const row = await db.impersonationSession.findUnique({ where: { id } });
  if (!row || row.adminUserId !== currentUserId || row.endedAt) {
    cookieStore.delete(IMPERSONATION_COOKIE);
    return null;
  }
  if (row.expiresAt < new Date()) {
    // Auto-expire: mark ended, clear cookie, audit. The next request the
    // admin makes returns to their own context.
    await db.impersonationSession.update({
      where: { id: row.id },
      data: { endedAt: new Date(), endedReason: "expired" },
    });
    cookieStore.delete(IMPERSONATION_COOKIE);
    const targetMembership = await db.organizationUser.findFirst({
      where: { userId: row.targetUserId, status: "active" },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true },
    });
    if (targetMembership) {
      await writeAudit({
        organizationId: targetMembership.organizationId,
        actorUserId: row.targetUserId,
        actorType: "system",
        impersonatedBy: row.adminUserId,
        action: AUDIT_ACTIONS.adminImpersonationExpired,
        entityType: "impersonation_session",
        entityId: row.id,
      });
    }
    return null;
  }
  return {
    id: row.id,
    adminUserId: row.adminUserId,
    targetUserId: row.targetUserId,
    expiresAt: row.expiresAt,
  };
}
