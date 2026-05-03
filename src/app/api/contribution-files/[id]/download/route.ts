import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { storage } from "@/lib/storage";

const Params = z.object({ id: z.string().min(1) });

export const GET = apiHandler({ paramsSchema: Params }, async ({ params, ctx }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.planRead);

  const file = await db.contributionFile.findUnique({
    where: { id: params.id },
    include: {
      payrollRun: {
        select: { plan: { select: { companyId: true, company: { select: { organizationId: true } } } } },
      },
    },
  });
  if (!file || file.payrollRun.plan.company.organizationId !== actor.organizationId) {
    throw notFound("Contribution file");
  }

  const bytes = await storage().getObject(file.storageKey);

  await writeAudit({
    organizationId: actor.organizationId,
    companyId: file.payrollRun.plan.companyId,
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.dataExported,
    entityType: "contribution_file",
    entityId: file.id,
    metadata: { format: file.format, version: file.version, sizeBytes: bytes.length },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="contribution_v${file.version}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
