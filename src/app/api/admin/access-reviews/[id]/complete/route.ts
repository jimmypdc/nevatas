// Complete a draft access review. Requires every item to have a decision;
// optionally captures a reviewer-supplied summary note. After completion
// the review is immutable by service convention.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { completeAccessReview } from "@/lib/services/access-review";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({ notes: z.string().optional() });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    const result = await completeAccessReview({
      actorUserId: actor.userId,
      reviewId: params.id,
      notes: body.notes,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(result, { status: 200 });
  },
);
