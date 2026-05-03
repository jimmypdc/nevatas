import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { generateContributionFile } from "@/lib/services/contribution-file";

const Body = z.object({ payrollRunId: z.string().min(1) });

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.contributionGenerate);

  const run = await db.payrollRun.findUnique({
    where: { id: body.payrollRunId },
    select: { plan: { select: { companyId: true, company: { select: { organizationId: true } } } } },
  });
  if (!run || run.plan.company.organizationId !== actor.organizationId) {
    throw notFound("Payroll run");
  }

  const result = await generateContributionFile({
    organizationId: actor.organizationId,
    companyId: run.plan.companyId,
    actorUserId: actor.userId,
    payrollRunId: body.payrollRunId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return NextResponse.json(result, { status: 201 });
});
