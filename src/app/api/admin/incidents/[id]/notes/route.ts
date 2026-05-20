// Add a free-form note to an open incident timeline.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { addIncidentNote } from "@/lib/services/incident";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({ note: z.string().min(1) });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    await addIncidentNote({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      incidentId: params.id,
      note: body.note,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true });
  },
);
