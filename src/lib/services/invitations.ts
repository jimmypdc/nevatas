// User invitations.
//
// Lifecycle:
//   1. Inviter (user.invite) calls createInvitation with { email, roleKey }.
//      Server validates target role, supersedes any prior live invite for
//      the same (org, email), persists token hash, audits, enqueues email.
//   2. Recipient opens the email link → /accept-invite?token=…
//   3. lookupInvitationByToken returns a UI-safe summary (org name, inviter
//      name, target email, whether the email already has a Nevatas user).
//   4. acceptInvitation creates the membership. If the email is new, also
//      creates the User with the supplied name + password (validated against
//      the policy). If the email already has a user, the password field is
//      ignored — the existing user just gains the new membership.
//   5. revokeInvitation cancels a pending invite.

import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { sha256Hex, hashPassword } from "@/lib/crypto/hashing";
import { validatePassword } from "@/lib/auth/password-policy";
import { enqueueEmail } from "@/lib/email/send";
import { TEMPLATES } from "@/lib/email/templates";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";
import { ROLES, type RoleKey } from "@/lib/rbac/roles";

const TOKEN_BYTES = 32;
const TTL_MS = 7 * 24 * 60 * 60_000;

// Roles that an inviter cannot grant via the invitation flow regardless of
// their own permissions. Platform admin paths are out of band; participant
// is reserved for a future participant-portal flow.
const INVITE_DENYLIST: ReadonlySet<string> = new Set([
  ROLES.platformSuperAdmin,
  ROLES.platformSupportAdmin,
  ROLES.participant,
  ROLES.apiClient,
]);

export type CreateInvitationInput = {
  organizationId: string;
  inviterUserId: string;
  email: string;
  roleKey: RoleKey;
  appUrl: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function createInvitation(input: CreateInvitationInput) {
  if (INVITE_DENYLIST.has(input.roleKey)) {
    throw blockedByPolicy(`Role "${input.roleKey}" cannot be assigned via invitation`);
  }
  const emailLower = input.email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
    throw validationError("Invalid email address");
  }

  const role = await db.role.findUnique({ where: { key: input.roleKey } });
  if (!role) throw notFound("Role");

  // Reject if the email already has an active membership in this org —
  // there's nothing to invite them to.
  const existing = await db.user.findUnique({
    where: { email: emailLower },
    select: {
      id: true,
      name: true,
      organizations: { where: { organizationId: input.organizationId, status: "active" } },
    },
  });
  if (existing && existing.organizations.length > 0) {
    throw blockedByPolicy("That email already has an active membership in this organization");
  }

  // Supersede any prior live invitation for (org, email) so the partial
  // unique index doesn't trip and the recipient can only redeem the latest.
  await db.invitation.updateMany({
    where: {
      organizationId: input.organizationId,
      emailLower,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date(), revokedByUserId: input.inviterUserId },
  });

  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + TTL_MS);

  const inviter = await db.user.findUniqueOrThrow({
    where: { id: input.inviterUserId },
    select: { name: true, email: true },
  });
  const org = await db.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { name: true },
  });

  const created = await db.$transaction(async (tx) => {
    const invitation = await tx.invitation.create({
      data: {
        organizationId: input.organizationId,
        emailLower,
        roleId: role.id,
        inviterUserId: input.inviterUserId,
        tokenHash,
        expiresAt,
      },
    });
    await writeAudit(
      {
        organizationId: input.organizationId,
        actorUserId: input.inviterUserId,
        action: AUDIT_ACTIONS.userInvited,
        entityType: "invitation",
        entityId: invitation.id,
        after: { email: emailLower, roleKey: input.roleKey, expiresAt: expiresAt.toISOString() },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
    return invitation;
  });

  const acceptUrl = `${input.appUrl.replace(/\/+$/, "")}/accept-invite?token=${encodeURIComponent(rawToken)}`;
  await enqueueEmail({
    template: TEMPLATES.userInvite,
    to: emailLower,
    recipientUserId: existing?.id ?? null,
    organizationId: input.organizationId,
    replyTo: inviter.email,
    params: {
      recipientName: existing?.name ?? null,
      inviterName: inviter.name ?? inviter.email,
      organizationName: org.name,
      acceptUrl,
      expiresInDays: Math.floor(TTL_MS / 86_400_000),
    },
    dedupKey: `invite:${tokenHash}`,
  });

  return {
    id: created.id,
    email: emailLower,
    roleKey: input.roleKey,
    expiresAt: created.expiresAt,
    hasExistingUser: Boolean(existing),
  };
}

export type RevokeInvitationInput = {
  organizationId: string;
  actorUserId: string;
  invitationId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function revokeInvitation(input: RevokeInvitationInput) {
  const invite = await db.invitation.findUnique({ where: { id: input.invitationId } });
  if (!invite || invite.organizationId !== input.organizationId) throw notFound("Invitation");
  if (invite.acceptedAt) throw blockedByPolicy("Invitation has already been accepted");
  if (invite.revokedAt) throw blockedByPolicy("Invitation has already been revoked");

  await db.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: invite.id },
      data: { revokedAt: new Date(), revokedByUserId: input.actorUserId },
    });
    await writeAudit(
      {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.userInviteRevoked,
        entityType: "invitation",
        entityId: invite.id,
        before: { acceptedAt: null, revokedAt: null },
        after: { revokedAt: new Date().toISOString() },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
  return { id: invite.id, revokedAt: new Date() };
}

// UI-safe summary of an invitation, looked up by raw token. Public — no
// auth required since the token IS the auth.
export async function lookupInvitationByToken(rawToken: string) {
  const tokenHash = sha256Hex(rawToken);
  const invite = await db.invitation.findUnique({
    where: { tokenHash },
    include: {
      organization: { select: { name: true } },
      role: { select: { key: true, name: true } },
    },
  });
  if (!invite) throw notFound("Invitation");
  if (invite.revokedAt) throw blockedByPolicy("Invitation has been revoked");
  if (invite.acceptedAt) throw blockedByPolicy("Invitation has already been accepted");
  if (invite.expiresAt < new Date()) throw blockedByPolicy("Invitation has expired");

  const inviter = await db.user.findUniqueOrThrow({
    where: { id: invite.inviterUserId },
    select: { name: true, email: true },
  });
  const existingUser = await db.user.findUnique({
    where: { email: invite.emailLower },
    select: { id: true },
  });

  return {
    organizationName: invite.organization.name,
    roleKey: invite.role.key,
    roleName: invite.role.name,
    inviterName: inviter.name ?? inviter.email,
    email: invite.emailLower,
    hasExistingUser: Boolean(existingUser),
    expiresAt: invite.expiresAt,
  };
}

export type AcceptInvitationInput = {
  rawToken: string;
  // Required when the email has no existing user; ignored otherwise.
  name?: string;
  password?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function acceptInvitation(input: AcceptInvitationInput) {
  const tokenHash = sha256Hex(input.rawToken);
  const invite = await db.invitation.findUnique({
    where: { tokenHash },
    include: { role: true },
  });
  if (!invite) throw notFound("Invitation");
  if (invite.revokedAt) throw blockedByPolicy("Invitation has been revoked");
  if (invite.acceptedAt) throw blockedByPolicy("Invitation has already been accepted");
  if (invite.expiresAt < new Date()) throw blockedByPolicy("Invitation has expired");

  const existing = await db.user.findUnique({ where: { email: invite.emailLower } });

  let userIdToUse: string;

  if (existing) {
    // Just attach the membership; never modify identity.
    userIdToUse = existing.id;
  } else {
    if (!input.password || !input.name) {
      throw validationError("New users must supply name and password");
    }
    const policy = await validatePassword(input.password);
    if (!policy.ok) {
      throw validationError("Password does not meet policy", { reasons: policy.reasons });
    }
    const passwordHash = await hashPassword(input.password);
    const created = await db.user.create({
      data: {
        email: invite.emailLower,
        name: input.name.trim(),
        passwordHash,
        passwordChangedAt: new Date(),
        emailVerified: new Date(), // accepting the email link verifies it
      },
      select: { id: true },
    });
    userIdToUse = created.id;
  }

  const result = await db.$transaction(async (tx) => {
    // The inviter may have re-issued an invite while the recipient was
    // accepting; guard the membership upsert by (org, user). If a row
    // already exists, leave it alone (per ERISA-safe principle: never
    // silently change existing identity / role assignments).
    const membership = await tx.organizationUser.upsert({
      where: { organizationId_userId: { organizationId: invite.organizationId, userId: userIdToUse } },
      update: {}, // no-op if a membership snuck in via another path
      create: {
        organizationId: invite.organizationId,
        userId: userIdToUse,
        roleId: invite.roleId,
        status: "active",
      },
    });

    const updated = await tx.invitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedByUserId: userIdToUse },
    });

    await writeAudit(
      {
        organizationId: invite.organizationId,
        actorUserId: userIdToUse,
        action: AUDIT_ACTIONS.userInviteAccepted,
        entityType: "invitation",
        entityId: invite.id,
        after: {
          userId: userIdToUse,
          membershipId: membership.id,
          roleKey: invite.role.key,
          createdNewUser: !existing,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx as Prisma.TransactionClient,
    );

    return { invitationId: updated.id, userId: userIdToUse, membershipId: membership.id };
  });

  return result;
}

export async function listInvitations(organizationId: string) {
  return db.invitation.findMany({
    where: { organizationId, acceptedAt: null, revokedAt: null },
    include: { role: { select: { key: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
