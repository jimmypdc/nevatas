import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireMfaIfPermissionRequires } from "@/lib/auth/mfa-enforcement";
import { requireActor } from "@/lib/session";
import { recordSponsorApproval } from "@/lib/services/approval";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({ acknowledgement: z.literal(true) });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.contributionApprove);
    await requireMfaIfPermissionRequires(actor, PERMISSIONS.contributionApprove);

    const file = await db.contributionFile.findUnique({
      where: { id: params.id },
      include: {
        payrollRun: {
          select: { id: true, plan: { select: { company: { select: { id: true, organizationId: true } } } } },
        },
      },
    });
    if (!file || file.payrollRun.plan.company.organizationId !== actor.organizationId) {
      throw notFound("Contribution file");
    }

    const approval = await recordSponsorApproval({
      organizationId: actor.organizationId,
      companyId: file.payrollRun.plan.company.id,
      actorUserId: actor.userId,
      payrollRunId: file.payrollRun.id,
      contributionFileId: file.id,
      acknowledgement: body.acknowledgement,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(approval, { status: 201 });
  },
);
