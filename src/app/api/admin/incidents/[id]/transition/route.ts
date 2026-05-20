// Move an incident forward through its lifecycle (open → contained → resolved).
// The closed transition has its own endpoint because it requires the
// root-cause / containment / resolution narrative fields.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { transitionIncidentStatus } from "@/lib/services/incident";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  toStatus: z.enum(["contained", "resolved"]),
  note: z.string().optional(),
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    await transitionIncidentStatus({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      incidentId: params.id,
      toStatus: body.toStatus,
      note: body.note,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true });
  },
);
