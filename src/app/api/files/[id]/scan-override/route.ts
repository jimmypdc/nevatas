import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { overrideScanVerdict } from "@/lib/services/file-scan";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  reason: z.string().min(10).max(2000),
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.payrollFileScanOverride);

    const file = await db.payrollSourceFile.findUnique({
      where: { id: params.id },
      select: { companyId: true, company: { select: { organizationId: true } } },
    });
    if (!file || file.company.organizationId !== actor.organizationId) {
      throw notFound("Source file");
    }

    const updated = await overrideScanVerdict({
      organizationId: actor.organizationId,
      companyId: file.companyId,
      actorUserId: actor.userId,
      sourceFileId: params.id,
      reason: body.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json({
      id: updated.id,
      scanStatus: updated.scanStatus,
      scanOverrideAt: updated.scanOverrideAt,
    });
  },
);
