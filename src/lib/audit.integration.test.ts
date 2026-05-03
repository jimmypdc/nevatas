// Integration test for the AuditEvent append-only DB trigger.
//
// Skipped by default. Run against the dev database with:
//   RUN_DB_INTEGRATION_TESTS=1 npm test
//
// Assumes the migrations in prisma/migrations have been applied to the
// database referenced by DATABASE_URL.

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("AuditEvent append-only triggers", () => {
  const prisma = new PrismaClient();
  let createdId: string | null = null;
  let orgId: string | null = null;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "Trigger Test Org", slug: `trigger-test-${Date.now()}` },
    });
    orgId = org.id;
    const ev = await prisma.auditEvent.create({
      data: {
        organizationId: org.id,
        actorType: "system",
        action: "audit.trigger.test",
        entityType: "test",
      },
    });
    createdId = ev.id;
  });

  afterAll(async () => {
    if (orgId) {
      // Org cascade does not include AuditEvent; leave the audit row in place
      // (that's the point) and just remove the org.
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("rejects UPDATE on AuditEvent rows", async () => {
    if (!createdId) throw new Error("no audit row");
    await expect(
      prisma.auditEvent.update({
        where: { id: createdId },
        data: { action: "audit.trigger.test.tampered" },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it("rejects DELETE on AuditEvent rows", async () => {
    if (!createdId) throw new Error("no audit row");
    await expect(
      prisma.auditEvent.delete({ where: { id: createdId } }),
    ).rejects.toThrow(/append-only/i);
  });

  it("rejects TRUNCATE on AuditEvent table", async () => {
    await expect(
      prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent"'),
    ).rejects.toThrow(/append-only/i);
  });
});
