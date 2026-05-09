// Records the date contributions actually landed in the plan trust account.
// The timeliness validator measures payrollDate -> fundedAt when set,
// freezing the elapsed-days result instead of growing past the threshold as
// the run ages. Idempotent — recording the same fundedAt twice is a no-op
// audit-wise; recording a DIFFERENT date overwrites with a new audit event.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { recordFunding } from "@/lib/services/contribution-funding";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  // ISO 8601 date or datetime. Accepting a date-only value is convenient
  // because the operator typically reads the date off a bank statement.
  fundedAt: z.string().min(8),
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.contributionSubmit);

    const file = await db.contributionFile.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        payrollRun: {
          select: {
            plan: { select: { company: { select: { id: true, organizationId: true } } } },
          },
        },
      },
    });
    if (!file || file.payrollRun.plan.company.organizationId !== actor.organizationId) {
      throw notFound("Contribution file");
    }

    const result = await recordFunding({
      organizationId: actor.organizationId,
      companyId: file.payrollRun.plan.company.id,
      actorUserId: actor.userId,
      contributionFileId: file.id,
      fundedAt: new Date(body.fundedAt),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(result, { status: 200 });
  },
);
