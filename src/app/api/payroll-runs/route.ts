import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { createPayrollRunFromFile } from "@/lib/services/payroll-run";

const Body = z.object({
  companyId: z.string().min(1),
  planId: z.string().min(1),
  sourceFileId: z.string().min(1),
  mapping: z.record(z.string(), z.string()),
  reportedTotals: z.object({
    grossCompensation: z.number().nonnegative(),
    preTaxDeferral: z.number().nonnegative(),
    rothDeferral: z.number().nonnegative(),
    employerMatch: z.number().nonnegative(),
    loanRepayment: z.number().nonnegative(),
  }),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.validationRun);

  // Tenant scoping check.
  const company = await db.company.findFirst({
    where: { id: body.companyId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!company) throw notFound("Company");

  const result = await createPayrollRunFromFile({
    organizationId: actor.organizationId,
    companyId: body.companyId,
    planId: body.planId,
    actorUserId: actor.userId,
    sourceFileId: body.sourceFileId,
    mapping: body.mapping,
    reportedTotals: body.reportedTotals,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return NextResponse.json(result, { status: 201 });
});
