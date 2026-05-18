// Access review workflow — SOC 2 CC6.3 evidence of periodic logical-access
// review. Lifecycle: start (snapshot every active membership) → decide
// each item (confirm / revoke / note) → complete (lock the review with
// an attested signoff).
//
// "Revoke" is recorded as a decision but does NOT auto-revoke the
// membership. Revocation is a separate action with its own audit; the
// review is evidence that someone looked at the membership and made a
// determination. Coupling them risks the reviewer rushing through and
// disabling accounts they shouldn't.
//
// Completed reviews are immutable by service convention — the DB doesn't
// enforce it the way AuditEvent does, but every mutation function checks
// status === "draft" before touching the row.

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";

export type StartReviewInput = {
  actorUserId: string;
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type StartReviewResult = {
  reviewId: string;
  itemCount: number;
};

export async function startAccessReview(input: StartReviewInput): Promise<StartReviewResult> {
  if (input.periodEnd.getTime() <= input.periodStart.getTime()) {
    throw validationError("periodEnd must be after periodStart");
  }
  if (input.periodEnd.getTime() > Date.now() + 24 * 3600_000) {
    // Allow up to a day's clock drift; otherwise refuse review periods
    // that haven't happened yet.
    throw validationError("periodEnd cannot be in the future");
  }

  const org = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, name: true },
  });
  if (!org) throw notFound("Organization");

  const memberships = await db.organizationUser.findMany({
    where: { organizationId: org.id, status: "active" },
    include: {
      user: { select: { id: true, email: true, mfaEnabled: true } },
      role: { select: { key: true } },
    },
    orderBy: { user: { email: "asc" } },
  });

  if (memberships.length === 0) {
    throw validationError("Organization has no active memberships to review");
  }

  const snapshotJson = {
    capturedAt: new Date().toISOString(),
    organizationName: org.name,
    memberships: memberships.map((m) => ({
      organizationUserId: m.id,
      userId: m.user.id,
      email: m.user.email,
      roleKey: m.role.key,
      mfaEnabled: m.user.mfaEnabled,
    })),
  };

  const review = await db.$transaction(async (tx) => {
    const r = await tx.accessReview.create({
      data: {
        organizationId: org.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: "draft",
        createdById: input.actorUserId,
        membershipSnapshotJson: snapshotJson as Prisma.InputJsonValue,
      },
    });
    await tx.accessReviewItem.createMany({
      data: memberships.map((m) => ({
        accessReviewId: r.id,
        organizationUserId: m.id,
        userId: m.user.id,
        userEmail: m.user.email,
        roleKey: m.role.key,
        mfaEnabled: m.user.mfaEnabled,
      })),
    });

    await writeAudit(
      {
        organizationId: org.id,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.accessReviewStarted,
        entityType: "access_review",
        entityId: r.id,
        metadata: {
          periodStart: input.periodStart.toISOString(),
          periodEnd: input.periodEnd.toISOString(),
          itemCount: memberships.length,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return r;
  });

  return { reviewId: review.id, itemCount: memberships.length };
}

export type DecideItemInput = {
  actorUserId: string;
  reviewId: string;
  itemId: string;
  decision: "confirmed" | "revoke" | "note";
  note?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function decideAccessReviewItem(input: DecideItemInput): Promise<void> {
  if (input.decision === "note" && !input.note?.trim()) {
    throw validationError(`Decision "note" requires a non-empty note`);
  }
  if (input.decision === "revoke" && !input.note?.trim()) {
    throw validationError(`Decision "revoke" requires a justification note`);
  }

  await db.$transaction(async (tx) => {
    const review = await tx.accessReview.findUnique({
      where: { id: input.reviewId },
      select: { id: true, organizationId: true, status: true },
    });
    if (!review) throw notFound("Access review");
    if (review.status !== "draft") {
      throw blockedByPolicy("Cannot modify items on a non-draft review", {
        currentStatus: review.status,
      });
    }

    const item = await tx.accessReviewItem.findUnique({
      where: { id: input.itemId },
      select: { id: true, accessReviewId: true, userEmail: true },
    });
    if (!item || item.accessReviewId !== review.id) {
      throw notFound("Access review item");
    }

    await tx.accessReviewItem.update({
      where: { id: item.id },
      data: {
        decision: input.decision,
        decisionNote: input.note?.trim() || null,
        decidedById: input.actorUserId,
        decidedAt: new Date(),
      },
    });

    await writeAudit(
      {
        organizationId: review.organizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.accessReviewItemDecided,
        entityType: "access_review_item",
        entityId: item.id,
        metadata: {
          reviewId: review.id,
          userEmail: item.userEmail,
          decision: input.decision,
          hasNote: Boolean(input.note?.trim()),
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
}

export type CompleteReviewInput = {
  actorUserId: string;
  reviewId: string;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type CompleteReviewResult = {
  reviewId: string;
  itemCount: number;
  decisionCounts: { confirmed: number; revoke: number; note: number };
};

export async function completeAccessReview(input: CompleteReviewInput): Promise<CompleteReviewResult> {
  return db.$transaction(async (tx) => {
    const review = await tx.accessReview.findUnique({
      where: { id: input.reviewId },
      include: { items: { select: { decision: true } } },
    });
    if (!review) throw notFound("Access review");
    if (review.status !== "draft") {
      throw blockedByPolicy("Review is not in draft state", { currentStatus: review.status });
    }
    const undecided = review.items.filter((i) => i.decision === null).length;
    if (undecided > 0) {
      throw blockedByPolicy(`Cannot complete review with ${undecided} undecided item(s)`, {
        undecidedCount: undecided,
      });
    }

    const decisionCounts = {
      confirmed: review.items.filter((i) => i.decision === "confirmed").length,
      revoke: review.items.filter((i) => i.decision === "revoke").length,
      note: review.items.filter((i) => i.decision === "note").length,
    };

    await tx.accessReview.update({
      where: { id: review.id },
      data: {
        status: "completed",
        completedById: input.actorUserId,
        completedAt: new Date(),
        notes: input.notes?.trim() || null,
      },
    });

    await writeAudit(
      {
        organizationId: review.organizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.accessReviewCompleted,
        entityType: "access_review",
        entityId: review.id,
        metadata: {
          itemCount: review.items.length,
          decisionCounts,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return { reviewId: review.id, itemCount: review.items.length, decisionCounts };
  });
}

export type CancelReviewInput = {
  actorUserId: string;
  reviewId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function cancelAccessReview(input: CancelReviewInput): Promise<void> {
  if (!input.reason.trim()) {
    throw validationError("Cancellation reason is required");
  }
  await db.$transaction(async (tx) => {
    const review = await tx.accessReview.findUnique({
      where: { id: input.reviewId },
      select: { id: true, organizationId: true, status: true },
    });
    if (!review) throw notFound("Access review");
    if (review.status !== "draft") {
      throw blockedByPolicy("Review is not in draft state", { currentStatus: review.status });
    }

    await tx.accessReview.update({
      where: { id: review.id },
      data: {
        status: "cancelled",
        cancelledById: input.actorUserId,
        cancelledAt: new Date(),
        cancelReason: input.reason.trim(),
      },
    });

    await writeAudit(
      {
        organizationId: review.organizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.accessReviewCancelled,
        entityType: "access_review",
        entityId: review.id,
        metadata: { reason: input.reason.trim() },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
}
