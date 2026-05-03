// Lightweight polling endpoint. Returns the most-recent SyncJob's
// status + summary so the connections-page UI can update from
// "Syncing…" to "Synced N employees, M runs created" without a full
// page reload.

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
  requirePermission(actor, PERMISSIONS.payrollConnectionRead);

  const conn = await db.payrollConnection.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      companyId: true,
      provider: true,
      company: { select: { organizationId: true } },
    },
  });
  if (!conn || conn.company.organizationId !== actor.organizationId) {
    throw notFound("Payroll connection");
  }

  const latest = await db.syncJob.findFirst({
    where: { companyId: conn.companyId, provider: conn.provider },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      errorMessage: true,
      metadataJson: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    connectionId: conn.id,
    latest: latest
      ? {
          id: latest.id,
          status: latest.status,
          startedAt: latest.startedAt,
          completedAt: latest.completedAt,
          errorMessage: latest.errorMessage,
          summary: latest.metadataJson,
          createdAt: latest.createdAt,
        }
      : null,
  });
});
