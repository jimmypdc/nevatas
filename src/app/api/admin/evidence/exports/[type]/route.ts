// SOC 2 evidence CSV exports. One endpoint, dispatched by the [type] path
// segment. Gated on platform.impersonate since the data spans all orgs.
//
// Every successful export writes a data.exported audit event with the
// export type + row count + requesting user. The CSV itself is returned
// inline; we don't store generated exports — they're re-derivable from the
// live tables.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notFound, validationError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { buildEvidenceExport, type EvidenceExportType } from "@/lib/services/evidence-exports";

const TypeEnum = z.enum([
  "audit-events",
  "admin-actions",
  "login-attempts",
  "access-review",
  "access-reviews",
  "sponsor-approvals",
  "impersonation-sessions",
  "background-jobs",
  "incidents",
]);

export async function GET(
  req: NextRequest,
  routeContext: { params: Promise<{ type: string }> },
): Promise<Response> {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.platformImpersonate);

  const { type } = await routeContext.params;
  const parsed = TypeEnum.safeParse(type);
  if (!parsed.success) throw notFound("Evidence export type");
  const exportType: EvidenceExportType = parsed.data;

  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since");
  if (sinceRaw && Number.isNaN(new Date(sinceRaw).getTime())) {
    throw validationError("`since` must be an ISO 8601 date or datetime");
  }

  const result = await buildEvidenceExport(exportType, {
    sinceIso: sinceRaw ?? undefined,
  });

  await writeAudit({
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.dataExported,
    entityType: "evidence_export",
    entityId: exportType,
    metadata: {
      exportType,
      sinceIso: sinceRaw ?? null,
      rowCount: result.rowCount,
      filename: result.filename,
    },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return new Response(result.csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${result.filename}"`,
      "cache-control": "no-store",
    },
  });
}
