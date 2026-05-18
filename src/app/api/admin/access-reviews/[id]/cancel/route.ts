// Cancel a draft access review (rare; for restarts). Requires a reason.
// Cancelled reviews stay in the audit trail; they don't disappear.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { cancelAccessReview } from "@/lib/services/access-review";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({ reason: z.string().min(1) });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    await cancelAccessReview({
      actorUserId: actor.userId,
      reviewId: params.id,
      reason: body.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true });
  },
);
