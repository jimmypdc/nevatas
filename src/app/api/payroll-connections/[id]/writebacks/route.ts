// Create a write-back request against this connection. v1 supports
// deferral_election only.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import {
  WRITEBACK_REQUEST_TYPES,
  createWritebackRequest,
  type DeferralElectionPayload,
} from "@/lib/services/writeback";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  participantId: z.string().min(1),
  requestType: z.enum(WRITEBACK_REQUEST_TYPES),
  payload: z.object({
    effectiveDate: z.string().min(8),
    preTaxPercent: z.number().min(0).max(100).optional(),
    preTaxAmount: z.number().min(0).optional(),
    rothPercent: z.number().min(0).max(100).optional(),
    rothAmount: z.number().min(0).optional(),
  }),
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    // Reuse the existing payroll_sync.run permission — it's already
    // granted to the same persona that initiates the write-back side of
    // the integration. The approve step gates on contribution.submit
    // below so the actual provider call is separately authorized.
    requirePermission(actor, PERMISSIONS.payrollSyncRun);

    const conn = await db.payrollConnection.findUnique({
      where: { id: params.id },
      include: { company: { select: { id: true, organizationId: true } } },
    });
    if (!conn || conn.company.organizationId !== actor.organizationId) {
      throw notFound("Payroll connection");
    }

    const r = await createWritebackRequest({
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      companyId: conn.company.id,
      connectionId: conn.id,
      participantId: body.participantId,
      requestType: body.requestType,
      payload: body.payload as DeferralElectionPayload,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(r, { status: 201 });
  },
);
