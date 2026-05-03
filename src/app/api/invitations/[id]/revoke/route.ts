import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { revokeInvitation } from "@/lib/services/invitations";

const Params = z.object({ id: z.string().min(1) });

export const POST = apiHandler(
  { paramsSchema: Params, idempotent: true },
  async ({ params, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.userInvite);

    const invite = await db.invitation.findUnique({
      where: { id: params.id },
      select: { organizationId: true },
    });
    if (!invite || invite.organizationId !== actor.organizationId) {
      throw notFound("Invitation");
    }

    const result = await revokeInvitation({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      invitationId: params.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return NextResponse.json(result);
  },
);
