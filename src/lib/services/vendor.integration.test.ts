// Integration tests for the vendor risk register service. Skipped by
// default; run with: RUN_DB_INTEGRATION_TESTS=1 npm test

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createVendor,
  recordVendorReview,
  retireVendor,
  updateVendor,
} from "@/lib/services/vendor";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("vendor service", () => {
  const prisma = new PrismaClient();
  let orgId: string;
  let adminId: string;
  const cleanupIds: string[] = [];

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "Vendor Test Org", slug: `vendor-test-${Date.now()}` },
    });
    orgId = org.id;
    const admin = await prisma.user.create({
      data: { email: `vendor-admin-${Date.now()}@example.test`, status: "active" },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    for (const id of cleanupIds) {
      await prisma.vendor.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: adminId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("creates a vendor with the supplied data categories", async () => {
    const r = await createVendor({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      name: `AWS-KMS-test-${Date.now()}`,
      description: "Master-key custody",
      category: "security",
      criticality: "critical",
      dataCategories: ["dek_wrapping_keys"],
    });
    cleanupIds.push(r.vendorId);
    const v = await prisma.vendor.findUniqueOrThrow({ where: { id: r.vendorId } });
    expect(v.criticality).toBe("critical");
    expect(v.status).toBe("active");
    expect(v.lastReviewedAt).toBeNull();
    expect(v.nextReviewDueAt).toBeNull();
  });

  it("refuses duplicate vendor names", async () => {
    const name = `Dup-Test-${Date.now()}`;
    const r1 = await createVendor({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      name,
      description: "x",
      category: "other",
      criticality: "low",
      dataCategories: [],
    });
    cleanupIds.push(r1.vendorId);
    await expect(
      createVendor({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        name,
        description: "x",
        category: "other",
        criticality: "low",
        dataCategories: [],
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("recordVendorReview sets lastReviewedAt and computes nextReviewDueAt from cadence", async () => {
    const r = await createVendor({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      name: `Sendgrid-test-${Date.now()}`,
      description: "Transactional email",
      category: "communications",
      criticality: "medium",
      dataCategories: ["recipient_emails"],
    });
    cleanupIds.push(r.vendorId);

    const reviewedAt = Date.now();
    const result = await recordVendorReview({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      vendorId: r.vendorId,
      reviewNote: "Reviewed annual SOC 2 Type II report; no exceptions raised.",
    });
    // medium → 365-day cadence
    const expectedDue = reviewedAt + 365 * 86400_000;
    expect(Math.abs(result.nextReviewDueAt.getTime() - expectedDue)).toBeLessThan(10_000);
  });

  it("recordVendorReview refuses without a note", async () => {
    const r = await createVendor({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      name: `Empty-note-test-${Date.now()}`,
      description: "x",
      category: "other",
      criticality: "low",
      dataCategories: [],
    });
    cleanupIds.push(r.vendorId);
    await expect(
      recordVendorReview({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        vendorId: r.vendorId,
        reviewNote: "   ",
      }),
    ).rejects.toThrow(/note/i);
  });

  it("updateVendor recomputes nextReviewDueAt when criticality changes (if previously reviewed)", async () => {
    const r = await createVendor({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      name: `Recompute-test-${Date.now()}`,
      description: "x",
      category: "infrastructure",
      criticality: "medium",
      dataCategories: [],
    });
    cleanupIds.push(r.vendorId);
    await recordVendorReview({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      vendorId: r.vendorId,
      reviewNote: "initial",
    });
    const v1 = await prisma.vendor.findUniqueOrThrow({ where: { id: r.vendorId } });
    const due1 = v1.nextReviewDueAt!.getTime();
    const lastReview = v1.lastReviewedAt!.getTime();

    await updateVendor({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      vendorId: r.vendorId,
      criticality: "critical",
    });
    const v2 = await prisma.vendor.findUniqueOrThrow({ where: { id: r.vendorId } });
    // critical → 90d; should be earlier than the prior 365d due date.
    const due2 = v2.nextReviewDueAt!.getTime();
    expect(due2).toBeLessThan(due1);
    // Anchored to original review (not to "now").
    expect(Math.abs(due2 - (lastReview + 90 * 86400_000))).toBeLessThan(10_000);
  });

  it("retires a vendor with a reason and blocks further mutations", async () => {
    const r = await createVendor({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      name: `Retire-test-${Date.now()}`,
      description: "x",
      category: "other",
      criticality: "low",
      dataCategories: [],
    });
    cleanupIds.push(r.vendorId);
    await retireVendor({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      vendorId: r.vendorId,
      reason: "Replaced with in-house alternative",
    });
    const v = await prisma.vendor.findUniqueOrThrow({ where: { id: r.vendorId } });
    expect(v.status).toBe("retired");
    expect(v.retirementReason).toBe("Replaced with in-house alternative");

    await expect(
      recordVendorReview({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        vendorId: r.vendorId,
        reviewNote: "x",
      }),
    ).rejects.toThrow(/retired/i);

    await expect(
      retireVendor({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        vendorId: r.vendorId,
        reason: "again",
      }),
    ).rejects.toThrow(/already retired/i);
  });
});
