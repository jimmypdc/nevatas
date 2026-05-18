// POST: start a new access review for an organization. Snapshots every
// active membership at that moment and creates one AccessReviewItem per row.
//
// Gated on platform.impersonate — same permission as the rest of the
// evidence-center machinery.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { startAccessReview } from "@/lib/services/access-review";

const Body = z.object({
  organizationId: z.string().min(1),
  periodStart: z.string().min(8), // ISO date or datetime
  periodEnd: z.string().min(8),
});

export const POST = apiHandler(
  { bodySchema: Body, idempotent: true },
  async ({ body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    const result = await startAccessReview({
      actorUserId: actor.userId,
      organizationId: body.organizationId,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(result, { status: 201 });
  },
);
