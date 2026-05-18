// Integration tests for the access-review service. Skipped by default;
// run against the dev database with:
//   RUN_DB_INTEGRATION_TESTS=1 npm test

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cancelAccessReview,
  completeAccessReview,
  decideAccessReviewItem,
  startAccessReview,
} from "@/lib/services/access-review";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("access-review service", () => {
  const prisma = new PrismaClient();
  let orgId: string;
  let adminId: string;
  let roleId: string;
  const cleanupUserIds: string[] = [];
  const cleanupReviewIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.findFirst();
    if (!role) throw new Error("Seed must run before this test");
    roleId = role.id;

    const org = await prisma.organization.create({
      data: { name: "AR Test Org", slug: `ar-test-${Date.now()}` },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: { email: `ar-admin-${Date.now()}@example.test`, status: "active" },
    });
    adminId = admin.id;
    cleanupUserIds.push(admin.id);

    // Three active members to review.
    for (let i = 0; i < 3; i++) {
      const u = await prisma.user.create({
        data: {
          email: `ar-member-${i}-${Date.now()}@example.test`,
          status: "active",
          mfaEnabled: i % 2 === 0,
        },
      });
      cleanupUserIds.push(u.id);
      await prisma.organizationUser.create({
        data: { organizationId: org.id, userId: u.id, roleId, status: "active" },
      });
    }
  });

  afterAll(async () => {
    for (const rid of cleanupReviewIds) {
      await prisma.accessReview.delete({ where: { id: rid } }).catch(() => undefined);
    }
    await prisma.organizationUser.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    for (const uid of cleanupUserIds) {
      await prisma.user.delete({ where: { id: uid } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("starts a review with one item per active membership", async () => {
    const r = await startAccessReview({
      actorUserId: adminId,
      organizationId: orgId,
      periodStart: new Date(Date.now() - 90 * 24 * 3600_000),
      periodEnd: new Date(),
    });
    cleanupReviewIds.push(r.reviewId);
    expect(r.itemCount).toBe(3);

    const review = await prisma.accessReview.findUniqueOrThrow({
      where: { id: r.reviewId },
      include: { items: true },
    });
    expect(review.status).toBe("draft");
    expect(review.items.length).toBe(3);
    expect(review.items.every((i) => i.decision === null)).toBe(true);
  });

  it("refuses period windows with end <= start", async () => {
    await expect(
      startAccessReview({
        actorUserId: adminId,
        organizationId: orgId,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() - 86400_000),
      }),
    ).rejects.toThrow(/periodEnd must be after periodStart/);
  });

  it("blocks completing a draft with undecided items", async () => {
    const started = await startAccessReview({
      actorUserId: adminId,
      organizationId: orgId,
      periodStart: new Date(Date.now() - 30 * 24 * 3600_000),
      periodEnd: new Date(),
    });
    cleanupReviewIds.push(started.reviewId);

    await expect(
      completeAccessReview({ actorUserId: adminId, reviewId: started.reviewId }),
    ).rejects.toThrow(/undecided/i);
  });

  it("requires a note when decision is revoke or note", async () => {
    const started = await startAccessReview({
      actorUserId: adminId,
      organizationId: orgId,
      periodStart: new Date(Date.now() - 30 * 24 * 3600_000),
      periodEnd: new Date(),
    });
    cleanupReviewIds.push(started.reviewId);

    const items = await prisma.accessReviewItem.findMany({
      where: { accessReviewId: started.reviewId },
      take: 1,
    });
    const item = items[0]!;
    await expect(
      decideAccessReviewItem({
        actorUserId: adminId,
        reviewId: started.reviewId,
        itemId: item.id,
        decision: "revoke",
      }),
    ).rejects.toThrow(/justification/i);
    await expect(
      decideAccessReviewItem({
        actorUserId: adminId,
        reviewId: started.reviewId,
        itemId: item.id,
        decision: "note",
        note: "",
      }),
    ).rejects.toThrow(/note/i);
  });

  it("completes when every item is decided + locks further decisions", async () => {
    const started = await startAccessReview({
      actorUserId: adminId,
      organizationId: orgId,
      periodStart: new Date(Date.now() - 30 * 24 * 3600_000),
      periodEnd: new Date(),
    });
    cleanupReviewIds.push(started.reviewId);

    const items = await prisma.accessReviewItem.findMany({
      where: { accessReviewId: started.reviewId },
    });
    for (const it of items) {
      await decideAccessReviewItem({
        actorUserId: adminId,
        reviewId: started.reviewId,
        itemId: it.id,
        decision: "confirmed",
      });
    }

    const result = await completeAccessReview({
      actorUserId: adminId,
      reviewId: started.reviewId,
      notes: "looks good",
    });
    expect(result.itemCount).toBe(3);
    expect(result.decisionCounts.confirmed).toBe(3);

    // Further decisions on a completed review are refused.
    const firstItem = items[0]!;
    await expect(
      decideAccessReviewItem({
        actorUserId: adminId,
        reviewId: started.reviewId,
        itemId: firstItem.id,
        decision: "confirmed",
      }),
    ).rejects.toThrow(/non-draft/i);
  });

  it("cancels a draft with a reason; audit row persists", async () => {
    const started = await startAccessReview({
      actorUserId: adminId,
      organizationId: orgId,
      periodStart: new Date(Date.now() - 30 * 24 * 3600_000),
      periodEnd: new Date(),
    });
    cleanupReviewIds.push(started.reviewId);

    await cancelAccessReview({
      actorUserId: adminId,
      reviewId: started.reviewId,
      reason: "wrong period",
    });

    const row = await prisma.accessReview.findUniqueOrThrow({ where: { id: started.reviewId } });
    expect(row.status).toBe("cancelled");
    expect(row.cancelReason).toBe("wrong period");
  });
});
