import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { parseSourceFile } from "@/lib/services/file-parse";

const Params = z.object({ id: z.string().min(1) });

export const POST = apiHandler({ paramsSchema: Params }, async ({ params, ctx }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.payrollFileParse);

  const file = await db.payrollSourceFile.findUnique({
    where: { id: params.id },
    select: { companyId: true, company: { select: { organizationId: true } } },
  });
  if (!file || file.company.organizationId !== actor.organizationId) {
    throw notFound("Source file");
  }

  const result = await parseSourceFile({
    organizationId: actor.organizationId,
    companyId: file.companyId,
    actorUserId: actor.userId,
    sourceFileId: params.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return NextResponse.json(result);
});
