// Integration tests for the security-policy service. Skipped by default;
// run with: RUN_DB_INTEGRATION_TESTS=1 npm test

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  acknowledgePolicyVersion,
  createSecurityPolicy,
  getOutstandingPoliciesForUser,
  publishNewVersion,
  retireSecurityPolicy,
} from "@/lib/services/security-policy";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("security-policy service", () => {
  const prisma = new PrismaClient();
  let orgId: string;
  let adminId: string;
  let memberId: string;
  const cleanupPolicyIds: string[] = [];

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "Policy Test Org", slug: `pol-test-${Date.now()}` },
    });
    orgId = org.id;
    const admin = await prisma.user.create({
      data: { email: `pol-admin-${Date.now()}@example.test`, status: "active" },
    });
    adminId = admin.id;
    const member = await prisma.user.create({
      data: { email: `pol-member-${Date.now()}@example.test`, status: "active" },
    });
    memberId = member.id;
  });

  afterAll(async () => {
    for (const id of cleanupPolicyIds) {
      await prisma.securityPolicy.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: adminId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: memberId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("creates policy with v1 content; refuses duplicate key", async () => {
    const key = `aup-test-${Date.now()}`;
    const r = await createSecurityPolicy({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      key,
      name: "Acceptable Use",
      initialContent: "# Acceptable Use\n\nBe nice.",
    });
    cleanupPolicyIds.push(r.policyId);

    const ver = await prisma.securityPolicyVersion.findUniqueOrThrow({ where: { id: r.versionId } });
    expect(ver.version).toBe(1);
    expect(ver.status).toBe("active");

    await expect(
      createSecurityPolicy({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        key,
        name: "dup",
        initialContent: "x",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("refuses invalid key format", async () => {
    await expect(
      createSecurityPolicy({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        key: "Has Spaces",
        name: "x",
        initialContent: "y",
      }),
    ).rejects.toThrow(/key/i);
  });

  it("publishing new version supersedes the prior active version", async () => {
    const r = await createSecurityPolicy({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      key: `vsr-${Date.now()}`,
      name: "Versioned",
      initialContent: "v1 content",
    });
    cleanupPolicyIds.push(r.policyId);

    const v2 = await publishNewVersion({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      policyId: r.policyId,
      content: "v2 content (updated)",
      changeSummary: "Refined wording.",
    });
    expect(v2.version).toBe(2);

    const prior = await prisma.securityPolicyVersion.findUniqueOrThrow({
      where: { id: r.versionId },
    });
    expect(prior.status).toBe("superseded");
  });

  it("publishing identical content is refused", async () => {
    const r = await createSecurityPolicy({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      key: `idn-${Date.now()}`,
      name: "Identical",
      initialContent: "same",
    });
    cleanupPolicyIds.push(r.policyId);

    await expect(
      publishNewVersion({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        policyId: r.policyId,
        content: "same",
        changeSummary: "x",
      }),
    ).rejects.toThrow(/identical/i);
  });

  it("outstanding policies reflect only active + unacknowledged versions", async () => {
    const r = await createSecurityPolicy({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      key: `out-${Date.now()}`,
      name: "Outstanding test",
      initialContent: "stuff",
    });
    cleanupPolicyIds.push(r.policyId);

    const before = await getOutstandingPoliciesForUser(memberId);
    expect(before.some((p) => p.versionId === r.versionId)).toBe(true);

    await acknowledgePolicyVersion({
      userId: memberId,
      organizationId: orgId,
      policyVersionId: r.versionId,
    });
    const after = await getOutstandingPoliciesForUser(memberId);
    expect(after.some((p) => p.versionId === r.versionId)).toBe(false);
  });

  it("acknowledgePolicyVersion is idempotent", async () => {
    const r = await createSecurityPolicy({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      key: `idm-${Date.now()}`,
      name: "Idempotent ack",
      initialContent: "x",
    });
    cleanupPolicyIds.push(r.policyId);

    const a = await acknowledgePolicyVersion({
      userId: memberId,
      organizationId: orgId,
      policyVersionId: r.versionId,
    });
    const b = await acknowledgePolicyVersion({
      userId: memberId,
      organizationId: orgId,
      policyVersionId: r.versionId,
    });
    expect(a.acknowledgmentId).toBe(b.acknowledgmentId);
    expect(b.alreadyAcknowledged).toBe(true);
  });

  it("retired policy drops out of outstanding queue", async () => {
    const r = await createSecurityPolicy({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      key: `ret-${Date.now()}`,
      name: "Retire test",
      initialContent: "x",
    });
    cleanupPolicyIds.push(r.policyId);

    await retireSecurityPolicy({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      policyId: r.policyId,
      reason: "no longer applicable",
    });

    // Use a fresh user so the policy hasn't been acknowledged either way.
    const freshUser = await prisma.user.create({
      data: { email: `pol-fresh-${Date.now()}@example.test`, status: "active" },
    });
    try {
      const out = await getOutstandingPoliciesForUser(freshUser.id);
      expect(out.some((p) => p.versionId === r.versionId)).toBe(false);
    } finally {
      await prisma.user.delete({ where: { id: freshUser.id } });
    }
  });
});
