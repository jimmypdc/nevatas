import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { resolveException } from "@/lib/services/exception";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  status: z.enum(["resolved", "acknowledged", "waived"]),
  resolutionNote: z.string().max(2000).optional(),
  waiverReason: z.string().max(2000).optional(),
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(
      actor,
      body.status === "waived" ? PERMISSIONS.exceptionWaive : PERMISSIONS.exceptionResolve,
    );

    // Scope check
    const issue = await db.validationIssue.findUnique({
      where: { id: params.id },
      select: {
        payrollRun: {
          select: { plan: { select: { company: { select: { id: true, organizationId: true } } } } },
        },
      },
    });
    if (!issue || issue.payrollRun.plan.company.organizationId !== actor.organizationId) {
      throw notFound("Exception");
    }

    const updated = await resolveException({
      organizationId: actor.organizationId,
      companyId: issue.payrollRun.plan.company.id,
      actorUserId: actor.userId,
      exceptionId: params.id,
      newStatus: body.status,
      resolutionNote: body.resolutionNote,
      waiverReason: body.waiverReason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(updated);
  },
);
