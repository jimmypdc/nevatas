// Audit-package download. Returns a ZIP that bundles every artifact tied
// to a payroll run — see lib/services/audit-package for the manifest. Used
// by TPAs preparing for client / DOL audits.
//
// Phase 1 builds the ZIP in memory. For very large runs (10k+ rows) this
// can spike heap; a streaming archiver-based path is the future
// enhancement noted in the service module.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { buildAuditPackage } from "@/lib/services/audit-package";

const Params = z.object({ id: z.string().min(1) });

export const GET = apiHandler({ paramsSchema: Params }, async ({ params, ctx }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.auditRead);

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

  const pkg = await buildAuditPackage({
    organizationId: actor.organizationId,
    payrollRunId: params.id,
    exportedByUserId: actor.userId,
  });

  await writeAudit({
    organizationId: actor.organizationId,
    companyId: run.plan.companyId,
    planId: run.planId,
    actorUserId: actor.userId,
    impersonatedBy: actor.impersonatedBy,
    action: AUDIT_ACTIONS.dataExported,
    entityType: "payroll_run",
    entityId: params.id,
    metadata: {
      kind: "audit_package",
      sizeBytes: pkg.zipBytes.length,
      entryCount: pkg.manifest.entries.length,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return new NextResponse(new Uint8Array(pkg.zipBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${pkg.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
});
