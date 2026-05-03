// OAuth start route. Triggered by the user clicking "Connect Paycor" (or
// any other provider) on the company connections page.
//
// Flow:
//   1. Validate the actor + payroll_connection.create permission.
//   2. Validate the company is in the actor's org.
//   3. Resolve / create an inactive PayrollConnection row for this provider.
//   4. Sign a state token carrying connectionId + userId + companyId.
//   5. Ask the adapter to construct its authorize URL.
//   6. 302 the browser there.
//
// The redirect_uri is computed from APP_URL — the host the operator
// pre-registered with the provider must match this value byte-for-byte.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { forbidden, notFound, validationError } from "@/lib/errors";
import { adapterFor } from "@/lib/integrations/registry";
import type { PayrollProviderName } from "@/lib/integrations/types";
import { signOAuthState } from "@/lib/integrations/oauth-state";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";

const ProviderEnum = z.enum([
  "paycor",
  "adp",
  "gusto",
  "paychex",
  "isolved",
  "quickbooks",
]);

const Query = z.object({
  companyId: z.string().min(1),
});

export async function GET(
  req: NextRequest,
  routeContext: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const params = await routeContext.params;
  const provider = ProviderEnum.parse(params.provider) as PayrollProviderName;

  const url = new URL(req.url);
  const q = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!q.success) {
    throw validationError("companyId query parameter is required");
  }

  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.payrollConnectionCreate);

  // Tenant scope check.
  const company = await db.company.findFirst({
    where: { id: q.data.companyId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!company) throw notFound("Company");

  // Reuse an existing inactive connection for this (company, provider) so
  // the user can retry after a failed callback without piling up
  // half-connected rows. Active connections always start a fresh row —
  // operators reconnect rather than overwriting tokens silently.
  let conn = await db.payrollConnection.findFirst({
    where: { companyId: company.id, provider, status: { in: ["inactive", "reauth_required", "error"] } },
  });
  if (!conn) {
    conn = await db.payrollConnection.create({
      data: {
        companyId: company.id,
        provider,
        status: "inactive",
        settingsJson: { initiatedBy: actor.userId, initiatedAt: new Date().toISOString() },
      },
    });
    await writeAudit({
      organizationId: actor.organizationId,
      companyId: company.id,
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.payrollConnectionCreated,
      entityType: "payroll_connection",
      entityId: conn.id,
      metadata: { provider, phase: "initiated" },
    });
  }

  const state = signOAuthState({
    connectionId: conn.id,
    userId: actor.userId,
    organizationId: actor.organizationId,
    companyId: company.id,
    provider,
  });

  const redirectUri = `${env().APP_URL.replace(/\/+$/, "")}/api/integrations/${provider}/callback`;
  const adapter = adapterFor(provider);

  let authorizeUrl: string;
  try {
    authorizeUrl = adapter.getAuthorizeUrl({ state, redirectUri });
  } catch (err) {
    // Live adapter constructor throws when sandbox creds are missing —
    // surface that as a 503 rather than a generic 500.
    throw forbidden(
      `Provider ${provider} is not configured: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return NextResponse.redirect(authorizeUrl, { status: 302 });
}
