// Decide a single access-review item: confirmed | revoke | note.
// "revoke" and "note" decisions require a non-empty justification.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { decideAccessReviewItem } from "@/lib/services/access-review";

const Params = z.object({ id: z.string().min(1), itemId: z.string().min(1) });
const Body = z.object({
  decision: z.enum(["confirmed", "revoke", "note"]),
  note: z.string().optional(),
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    await decideAccessReviewItem({
      actorUserId: actor.userId,
      reviewId: params.id,
      itemId: params.itemId,
      decision: body.decision,
      note: body.note,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true });
  },
);
