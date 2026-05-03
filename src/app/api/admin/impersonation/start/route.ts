import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { forbidden } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission, isImpersonating } from "@/lib/rbac/check";
import { requireActor, getActiveOrganizationId } from "@/lib/session";
import { startImpersonation } from "@/lib/services/impersonation";

const Body = z.object({
  targetUserId: z.string().min(1),
  reason: z.string().min(10).max(2000),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  const actor = await requireActor();
  // Refuse to start a new impersonation while already impersonating —
  // would corrupt the cookie + session-restore semantics. The user must
  // stop first.
  if (isImpersonating(actor)) {
    throw forbidden("End the current impersonation before starting another");
  }
  requirePermission(actor, PERMISSIONS.platformImpersonate);

  const adminPriorOrgId = await getActiveOrganizationId();

  const result = await startImpersonation({
    adminUserId: actor.userId,
    adminPriorOrgId: adminPriorOrgId ?? null,
    targetUserId: body.targetUserId,
    reason: body.reason,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return NextResponse.json(result, { status: 201 });
});
