// Retire a security policy. Soft retirement — the row + version history
// + acknowledgment evidence stay; status flips so future users are no
// longer gated on it.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { retireSecurityPolicy } from "@/lib/services/security-policy";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({ reason: z.string().min(1) });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    await retireSecurityPolicy({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      policyId: params.id,
      reason: body.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true });
  },
);
