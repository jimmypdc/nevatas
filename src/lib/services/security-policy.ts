// Security policy publication + acknowledgment service.
//
// Policy = the umbrella document ("Acceptable Use Policy")
// PolicyVersion = one iteration of its content. New versions auto-
//                 supersede the previous active version in the same
//                 transaction so there's exactly one active version per
//                 policy at any moment.
// Acknowledgment = (user, version) signoff. Unique constraint at the DB
//                  layer + idempotency at the service layer mean a user
//                  who clicks twice doesn't double-count.
//
// "Outstanding for user" = active versions of active policies the user
// has not yet acknowledged. The app layout uses this to gate access.

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";

const POLICY_KEY_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export type CreatePolicyInput = {
  actorUserId: string;
  actorOrganizationId: string;
  key: string;
  name: string;
  description?: string;
  // Initial v1 content. We don't support creating a policy with no
  // content — the schema would let it, but a key with no readable
  // version is useless to users + auditors.
  initialContent: string;
  initialChangeSummary?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function createSecurityPolicy(input: CreatePolicyInput): Promise<{
  policyId: string;
  versionId: string;
}> {
  if (!POLICY_KEY_RE.test(input.key)) {
    throw validationError(
      "key must be lowercase alphanumeric with hyphens; 3-64 chars; e.g. 'acceptable-use'",
    );
  }
  if (!input.name.trim()) throw validationError("name is required");
  if (!input.initialContent.trim()) throw validationError("initialContent is required");

  const existing = await db.securityPolicy.findUnique({ where: { key: input.key } });
  if (existing) throw blockedByPolicy(`Policy with key "${input.key}" already exists`);

  return db.$transaction(async (tx) => {
    const policy = await tx.securityPolicy.create({
      data: {
        key: input.key,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        status: "active",
        createdById: input.actorUserId,
      },
    });
    const version = await tx.securityPolicyVersion.create({
      data: {
        policyId: policy.id,
        version: 1,
        content: input.initialContent,
        changeSummary: input.initialChangeSummary?.trim() || null,
        status: "active",
        publishedById: input.actorUserId,
      },
    });

    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.securityPolicyCreated,
        entityType: "security_policy",
        entityId: policy.id,
        metadata: { key: policy.key, name: policy.name, version: 1 },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return { policyId: policy.id, versionId: version.id };
  });
}

export type PublishVersionInput = {
  actorUserId: string;
  actorOrganizationId: string;
  policyId: string;
  content: string;
  changeSummary: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function publishNewVersion(input: PublishVersionInput): Promise<{ versionId: string; version: number }> {
  if (!input.content.trim()) throw validationError("content is required");
  if (!input.changeSummary.trim()) {
    throw validationError(
      "changeSummary is required when publishing a new version — auditors expect to see what changed",
    );
  }

  return db.$transaction(async (tx) => {
    const policy = await tx.securityPolicy.findUnique({
      where: { id: input.policyId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!policy) throw notFound("Security policy");
    if (policy.status !== "active") {
      throw blockedByPolicy("Cannot publish a new version on a retired policy");
    }

    const priorVersion = policy.versions[0];
    if (priorVersion?.content === input.content) {
      // No-op: identical content. Don't write a new row.
      throw validationError("New version is identical to the previous active version");
    }

    if (priorVersion) {
      await tx.securityPolicyVersion.update({
        where: { id: priorVersion.id },
        data: { status: "superseded" },
      });
    }

    const nextVersion = (priorVersion?.version ?? 0) + 1;
    const created = await tx.securityPolicyVersion.create({
      data: {
        policyId: policy.id,
        version: nextVersion,
        content: input.content,
        changeSummary: input.changeSummary.trim(),
        status: "active",
        publishedById: input.actorUserId,
      },
    });

    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.securityPolicyVersionPublished,
        entityType: "security_policy_version",
        entityId: created.id,
        metadata: {
          policyId: policy.id,
          key: policy.key,
          version: nextVersion,
          supersededVersionId: priorVersion?.id ?? null,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return { versionId: created.id, version: nextVersion };
  });
}

export type RetirePolicyInput = {
  actorUserId: string;
  actorOrganizationId: string;
  policyId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function retireSecurityPolicy(input: RetirePolicyInput): Promise<void> {
  if (!input.reason.trim()) throw validationError("Retirement reason is required");

  await db.$transaction(async (tx) => {
    const policy = await tx.securityPolicy.findUnique({ where: { id: input.policyId } });
    if (!policy) throw notFound("Security policy");
    if (policy.status !== "active") throw blockedByPolicy("Policy is already retired");

    await tx.securityPolicy.update({
      where: { id: policy.id },
      data: { status: "retired", retiredAt: new Date(), retiredById: input.actorUserId },
    });

    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.securityPolicyRetired,
        entityType: "security_policy",
        entityId: policy.id,
        metadata: { key: policy.key, reason: input.reason.trim() },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
}

export type AcknowledgeInput = {
  userId: string;
  organizationId: string;
  policyVersionId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

// Idempotent: clicking twice is a no-op (returns the existing row's id).
// The unique constraint on (policyVersionId, userId) is the safety net;
// we check first to avoid the failed-insert audit noise.
export async function acknowledgePolicyVersion(
  input: AcknowledgeInput,
): Promise<{ acknowledgmentId: string; alreadyAcknowledged: boolean }> {
  const existing = await db.securityPolicyAcknowledgment.findUnique({
    where: { policyVersionId_userId: { policyVersionId: input.policyVersionId, userId: input.userId } },
  });
  if (existing) {
    return { acknowledgmentId: existing.id, alreadyAcknowledged: true };
  }

  return db.$transaction(async (tx) => {
    const version = await tx.securityPolicyVersion.findUnique({
      where: { id: input.policyVersionId },
      include: { policy: { select: { id: true, key: true, status: true } } },
    });
    if (!version) throw notFound("Policy version");
    if (version.status !== "active") {
      throw blockedByPolicy("Cannot acknowledge a superseded policy version");
    }
    if (version.policy.status !== "active") {
      throw blockedByPolicy("Cannot acknowledge a retired policy");
    }

    const ack = await tx.securityPolicyAcknowledgment.create({
      data: {
        policyVersionId: version.id,
        userId: input.userId,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });

    await writeAudit(
      {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        action: AUDIT_ACTIONS.securityPolicyAcknowledged,
        entityType: "security_policy_acknowledgment",
        entityId: ack.id,
        metadata: {
          policyVersionId: version.id,
          policyId: version.policy.id,
          policyKey: version.policy.key,
          version: version.version,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return { acknowledgmentId: ack.id, alreadyAcknowledged: false };
  });
}

export type OutstandingPolicy = {
  policyId: string;
  policyKey: string;
  policyName: string;
  policyDescription: string | null;
  versionId: string;
  version: number;
  content: string;
  publishedAt: Date;
  changeSummary: string | null;
};

// Returns the active version of every active policy the user has not
// acknowledged. Used by the app layout to gate access.
export async function getOutstandingPoliciesForUser(userId: string): Promise<OutstandingPolicy[]> {
  const activeVersions = await db.securityPolicyVersion.findMany({
    where: {
      status: "active",
      policy: { status: "active" },
      // Exclude versions this user already acknowledged.
      acknowledgments: { none: { userId } },
    },
    include: {
      policy: { select: { id: true, key: true, name: true, description: true } },
    },
    orderBy: { publishedAt: "asc" },
  });

  return activeVersions.map((v) => ({
    policyId: v.policy.id,
    policyKey: v.policy.key,
    policyName: v.policy.name,
    policyDescription: v.policy.description,
    versionId: v.id,
    version: v.version,
    content: v.content,
    publishedAt: v.publishedAt,
    changeSummary: v.changeSummary,
  }));
}
