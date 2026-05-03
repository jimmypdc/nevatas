// Manual sync trigger. Enqueues a payroll.sync background job and returns
// immediately with the BackgroundJob id; the worker process drains the
// queue and the operator polls /app/dashboard for the resulting
// PayrollRun rows. Idempotency-keyed so a double-click doesn't enqueue
// two parallel syncs against the same connection.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs/queue";
import { JOB_TYPES } from "@/lib/jobs/registry";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  sinceIso: z.string().nullable().optional(),
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.payrollSyncRun);

    const conn = await db.payrollConnection.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        companyId: true,
        provider: true,
        status: true,
        company: { select: { organizationId: true } },
      },
    });
    if (!conn || conn.company.organizationId !== actor.organizationId) {
      throw notFound("Payroll connection");
    }

    const enqueued = await enqueueJob({
      jobType: JOB_TYPES.payrollSync,
      payload: { connectionId: conn.id, sinceIso: body.sinceIso ?? null },
      context: {
        organizationId: actor.organizationId,
        companyId: conn.companyId,
        actorUserId: actor.userId,
        requestId: ctx.requestId ?? null,
      },
      // Window the dedup so a parallel-click within ~5 minutes is treated as
      // the same request, but a deliberate retry an hour later still works.
      idempotencyKey: `payroll-sync:${conn.id}:${Math.floor(Date.now() / (5 * 60_000))}`,
    });

    return NextResponse.json(
      {
        connectionId: conn.id,
        provider: conn.provider,
        jobId: enqueued.id,
        deduplicated: enqueued.deduplicated,
      },
      { status: 202 },
    );
  },
);
