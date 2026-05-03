import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { openCorrectionCycle } from "@/lib/services/correction-cycle";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  reason: z.string().min(10).max(1000),
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    // Opening a correction is effectively a generation precondition;
    // gate it behind the same permission as generating files.
    requirePermission(actor, PERMISSIONS.contributionGenerate);

    const run = await db.payrollRun.findUnique({
      where: { id: params.id },
      select: {
        planId: true,
        plan: { select: { companyId: true, company: { select: { organizationId: true } } } },
      },
    });
    if (!run || run.plan.company.organizationId !== actor.organizationId) {
      throw notFound("Payroll run");
    }

    const cycle = await openCorrectionCycle({
      organizationId: actor.organizationId,
      companyId: run.plan.companyId,
      planId: run.planId,
      actorUserId: actor.userId,
      payrollRunId: params.id,
      reason: body.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(
      {
        id: cycle.id,
        status: cycle.status,
        reason: cycle.reason,
        openedAt: cycle.openedAt,
        supersededFileId: cycle.supersededFileId,
      },
      { status: 201 },
    );
  },
);
