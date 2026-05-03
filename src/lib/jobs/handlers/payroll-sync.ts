// Job handler: trigger a sync from the configured payroll provider on a
// PayrollConnection. The handler is a thin wrapper around the sync
// service so retries / dead-letter / audit-attribution all flow through
// the existing job framework.

import { JOB_TYPES, registerHandler } from "@/lib/jobs/registry";
import { PermanentJobFailure } from "@/lib/jobs/types";
import { db } from "@/lib/db";
import { syncFromProvider } from "@/lib/services/paycor-sync";

registerHandler(JOB_TYPES.payrollSync, async (payload, ctx) => {
  // Defensive: confirm the connection still exists. Deletion is a
  // permanent failure — no amount of retry will recover.
  const conn = await db.payrollConnection.findUnique({
    where: { id: payload.connectionId },
    select: { id: true, companyId: true, company: { select: { organizationId: true } } },
  });
  if (!conn) {
    throw new PermanentJobFailure(`PayrollConnection ${payload.connectionId} no longer exists`);
  }

  await syncFromProvider({
    organizationId: conn.company.organizationId,
    connectionId: payload.connectionId,
    since: payload.sinceIso ? new Date(payload.sinceIso) : undefined,
    actorUserId: ctx.actorUserId ?? null,
    requestId: ctx.requestId ?? undefined,
  });
});
