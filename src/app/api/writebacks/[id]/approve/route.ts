// Approve a draft writeback. This is the gate that converts an
// operator-drafted change into an actual provider call. Permission:
// contribution.submit — same persona that signs off on contribution
// file submissions, since both push out-of-Nevatas changes.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { approveWritebackRequest } from "@/lib/services/writeback";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({ approvalNote: z.string().optional() });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.contributionSubmit);

    await approveWritebackRequest({
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      writebackId: params.id,
      approvalNote: body.approvalNote,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true });
  },
);
