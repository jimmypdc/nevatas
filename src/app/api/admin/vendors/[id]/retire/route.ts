// Retire a vendor. Soft retirement — the row stays in the register for
// audit history; it's just marked inactive and excluded from review-due
// counts.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { retireVendor } from "@/lib/services/vendor";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({ reason: z.string().min(1) });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    await retireVendor({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      vendorId: params.id,
      reason: body.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true });
  },
);
