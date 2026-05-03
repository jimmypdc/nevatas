import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { disconnectConnection } from "@/lib/services/payroll-connection";

const Params = z.object({ id: z.string().min(1) });

export const POST = apiHandler(
  { paramsSchema: Params, idempotent: true },
  async ({ params, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.payrollConnectionCreate);

    const conn = await db.payrollConnection.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        companyId: true,
        company: { select: { organizationId: true } },
      },
    });
    if (!conn || conn.company.organizationId !== actor.organizationId) {
      throw notFound("Payroll connection");
    }

    await disconnectConnection({
      organizationId: actor.organizationId,
      companyId: conn.companyId,
      actorUserId: actor.userId,
      connectionId: conn.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({ ok: true, connectionId: conn.id });
  },
);
