// Close an incident. Requires the full narrative (root cause + containment
// + resolution) — without them the closed row isn't useful evidence.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { closeIncident } from "@/lib/services/incident";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  rootCause: z.string().min(1),
  containmentActions: z.string().min(1),
  resolutionActions: z.string().min(1),
  closingNote: z.string().optional(),
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    await closeIncident({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      incidentId: params.id,
      rootCause: body.rootCause,
      containmentActions: body.containmentActions,
      resolutionActions: body.resolutionActions,
      closingNote: body.closingNote,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true });
  },
);
