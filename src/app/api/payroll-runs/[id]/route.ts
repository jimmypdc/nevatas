import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";

const Params = z.object({ id: z.string().min(1) });

export const GET = apiHandler({ paramsSchema: Params }, async ({ params }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.planRead);

  const run = await db.payrollRun.findUnique({
    where: { id: params.id },
    include: {
      plan: { include: { company: true } },
      contributions: {
        include: { participant: { select: { firstName: true, lastName: true, ssnLast4: true } } },
      },
      validationIssues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
      contributionFiles: { orderBy: { version: "desc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      correctionCycles: { orderBy: { openedAt: "desc" } },
    },
  });
  if (!run || run.plan.company.organizationId !== actor.organizationId) {
    throw notFound("Payroll run");
  }

  return NextResponse.json({
    id: run.id,
    status: run.status,
    payrollDate: run.payrollDate,
    payPeriodStart: run.payPeriodStart,
    payPeriodEnd: run.payPeriodEnd,
    sourceSystem: run.sourceSystem,
    sourceFileId: run.sourceFileId,
    totalGrossComp: run.totalGrossComp?.toString() ?? null,
    totalContributions: run.totalContributions?.toString() ?? null,
    plan: { id: run.plan.id, name: run.plan.name, companyId: run.plan.companyId },
    company: { id: run.plan.company.id, name: run.plan.company.name },
    contributionCount: run.contributions.length,
    contributions: run.contributions.map((c) => ({
      id: c.id,
      externalEmployeeId: c.externalEmployeeId,
      participantName: c.participant
        ? `${c.participant.firstName} ${c.participant.lastName}`.trim()
        : null,
      ssnLast4: c.participant?.ssnLast4 ?? null,
      grossCompensation: c.grossCompensation.toString(),
      preTaxDeferral: c.preTaxDeferral.toString(),
      rothDeferral: c.rothDeferral.toString(),
      employerMatch: c.employerMatch.toString(),
      loanRepayment: c.loanRepayment.toString(),
    })),
    issues: run.validationIssues,
    contributionFiles: run.contributionFiles,
    approvals: run.approvals,
    approvedAt: run.approvedAt,
    approvedById: run.approvedById,
    correctionCycles: run.correctionCycles,
  });
});
