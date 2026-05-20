// Record the customer-notification decision. Captured separately from
// closure so the decision (and reasoning) is auditable even if the
// incident is later closed as a false alarm.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { recordCustomerNotificationDecision } from "@/lib/services/incident";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({ required: z.boolean(), notes: z.string().min(1) });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    await recordCustomerNotificationDecision({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      incidentId: params.id,
      required: body.required,
      notes: body.notes,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true });
  },
);
