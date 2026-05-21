// Record a periodic vendor review. Sets lastReviewedAt + nextReviewDueAt
// (computed from criticality cadence) and writes the review note into
// the audit log so the review history is queryable.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { recordVendorReview } from "@/lib/services/vendor";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({ reviewNote: z.string().min(1) });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    const r = await recordVendorReview({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      vendorId: params.id,
      reviewNote: body.reviewNote,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(r);
  },
);
