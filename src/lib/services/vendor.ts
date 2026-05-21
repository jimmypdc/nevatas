// Vendor risk register service. Tracks third-party subprocessors and the
// last time we reviewed our relationship with each one. Review cadence
// is driven by criticality: a critical KMS provider gets reviewed every
// 90 days; a low-criticality analytics tool, every 2 years.
//
// We deliberately don't track review notes in a separate table — the
// audit log already captures the "what changed when by whom" trail
// auditors want to see. If customers later request structured review
// content (action items, sign-off attestations), we'll add a
// VendorReview model alongside.

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";

export const VENDOR_CATEGORIES = [
  "infrastructure",
  "security",
  "communications",
  "analytics",
  "payments",
  "other",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export const VENDOR_CRITICALITIES = ["low", "medium", "high", "critical"] as const;
export type VendorCriticality = (typeof VENDOR_CRITICALITIES)[number];

// How many days from one review to the next, by criticality. Pulled out
// as data so we can tune cadence centrally and tests can pin against
// known values. Numbers chosen to bracket common SOC 2 expectations:
// critical (KMS, primary DB) → quarterly; low (analytics, marketing
// tools) → biannual.
const REVIEW_CADENCE_DAYS: Record<VendorCriticality, number> = {
  critical: 90,
  high: 180,
  medium: 365,
  low: 730,
};

export function reviewCadenceDays(criticality: VendorCriticality): number {
  return REVIEW_CADENCE_DAYS[criticality];
}

function nextDueAt(reviewedAt: Date, criticality: VendorCriticality): Date {
  return new Date(reviewedAt.getTime() + REVIEW_CADENCE_DAYS[criticality] * 86400_000);
}

export type CreateVendorInput = {
  actorUserId: string;
  actorOrganizationId: string;
  name: string;
  description: string;
  category: VendorCategory;
  criticality: VendorCriticality;
  dataCategories: string[];
  dpaUrl?: string;
  websiteUrl?: string;
  contactEmail?: string;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function createVendor(input: CreateVendorInput): Promise<{ vendorId: string }> {
  if (!input.name.trim()) throw validationError("name is required");
  if (!input.description.trim()) throw validationError("description is required");

  const existing = await db.vendor.findUnique({ where: { name: input.name.trim() } });
  if (existing) throw blockedByPolicy(`Vendor "${input.name.trim()}" already exists`);

  return db.$transaction(async (tx) => {
    const v = await tx.vendor.create({
      data: {
        name: input.name.trim(),
        description: input.description.trim(),
        category: input.category,
        criticality: input.criticality,
        dataCategoriesJson: input.dataCategories as Prisma.InputJsonValue,
        dpaUrl: nullIfBlank(input.dpaUrl),
        websiteUrl: nullIfBlank(input.websiteUrl),
        contactEmail: nullIfBlank(input.contactEmail),
        notes: nullIfBlank(input.notes),
        createdById: input.actorUserId,
      },
    });
    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.vendorCreated,
        entityType: "vendor",
        entityId: v.id,
        metadata: {
          name: v.name,
          category: v.category,
          criticality: v.criticality,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
    return { vendorId: v.id };
  });
}

export type UpdateVendorInput = {
  actorUserId: string;
  actorOrganizationId: string;
  vendorId: string;
  // Same shape as create's mutable fields; name updates are allowed
  // (acquisitions, rebrands) but unique constraint still applies.
  description?: string;
  category?: VendorCategory;
  criticality?: VendorCriticality;
  dataCategories?: string[];
  dpaUrl?: string | null;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function updateVendor(input: UpdateVendorInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor) throw notFound("Vendor");
    if (vendor.status !== "active") {
      throw blockedByPolicy("Cannot edit a retired vendor");
    }

    const data: Prisma.VendorUpdateInput = {};
    if (input.description !== undefined) {
      if (!input.description.trim()) throw validationError("description cannot be empty");
      data.description = input.description.trim();
    }
    if (input.category !== undefined) data.category = input.category;
    if (input.criticality !== undefined) {
      data.criticality = input.criticality;
      // Recompute nextReviewDueAt against the new cadence if we have a
      // prior review on file; never invent a review date.
      if (vendor.lastReviewedAt) {
        data.nextReviewDueAt = nextDueAt(vendor.lastReviewedAt, input.criticality);
      }
    }
    if (input.dataCategories !== undefined) {
      data.dataCategoriesJson = input.dataCategories as Prisma.InputJsonValue;
    }
    if (input.dpaUrl !== undefined) data.dpaUrl = nullIfBlank(input.dpaUrl);
    if (input.websiteUrl !== undefined) data.websiteUrl = nullIfBlank(input.websiteUrl);
    if (input.contactEmail !== undefined) data.contactEmail = nullIfBlank(input.contactEmail);
    if (input.notes !== undefined) data.notes = nullIfBlank(input.notes);

    await tx.vendor.update({ where: { id: vendor.id }, data });

    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.vendorUpdated,
        entityType: "vendor",
        entityId: vendor.id,
        before: pickAuditableFields(vendor),
        after: { ...pickAuditableFields(vendor), ...data },
        metadata: { fieldsChanged: Object.keys(data) },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
}

export type RecordVendorReviewInput = {
  actorUserId: string;
  actorOrganizationId: string;
  vendorId: string;
  reviewNote: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function recordVendorReview(input: RecordVendorReviewInput): Promise<{
  vendorId: string;
  nextReviewDueAt: Date;
}> {
  if (!input.reviewNote.trim()) {
    throw validationError("Review note is required — it's the SOC 2 evidence");
  }

  return db.$transaction(async (tx) => {
    const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor) throw notFound("Vendor");
    if (vendor.status !== "active") {
      throw blockedByPolicy("Cannot review a retired vendor");
    }

    const now = new Date();
    const dueAt = nextDueAt(now, vendor.criticality as VendorCriticality);

    await tx.vendor.update({
      where: { id: vendor.id },
      data: {
        lastReviewedAt: now,
        lastReviewedById: input.actorUserId,
        nextReviewDueAt: dueAt,
      },
    });

    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.vendorReviewed,
        entityType: "vendor",
        entityId: vendor.id,
        metadata: {
          name: vendor.name,
          criticality: vendor.criticality,
          nextReviewDueAt: dueAt.toISOString(),
          // Stored in audit metadata rather than a separate column so the
          // review note IS the evidence — querying audit events for this
          // vendor produces a complete review history with attribution.
          reviewNote: input.reviewNote.trim(),
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return { vendorId: vendor.id, nextReviewDueAt: dueAt };
  });
}

export type RetireVendorInput = {
  actorUserId: string;
  actorOrganizationId: string;
  vendorId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function retireVendor(input: RetireVendorInput): Promise<void> {
  if (!input.reason.trim()) {
    throw validationError("Retirement reason is required");
  }

  await db.$transaction(async (tx) => {
    const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor) throw notFound("Vendor");
    if (vendor.status !== "active") {
      throw blockedByPolicy("Vendor is already retired");
    }

    await tx.vendor.update({
      where: { id: vendor.id },
      data: {
        status: "retired",
        retiredAt: new Date(),
        retiredById: input.actorUserId,
        retirementReason: input.reason.trim(),
      },
    });

    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.vendorRetired,
        entityType: "vendor",
        entityId: vendor.id,
        metadata: { name: vendor.name, reason: input.reason.trim() },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
}

function nullIfBlank(s: string | null | undefined): string | null {
  if (s === undefined || s === null) return null;
  const trimmed = s.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// Subset of vendor fields worth hashing into the audit before/after
// snapshot. Excludes timestamps + ids that change every save.
function pickAuditableFields(v: {
  description: string;
  category: string;
  criticality: string;
  dataCategoriesJson: unknown;
  dpaUrl: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  notes: string | null;
}) {
  return {
    description: v.description,
    category: v.category,
    criticality: v.criticality,
    dataCategories: v.dataCategoriesJson,
    dpaUrl: v.dpaUrl,
    websiteUrl: v.websiteUrl,
    contactEmail: v.contactEmail,
    notes: v.notes,
  };
}
