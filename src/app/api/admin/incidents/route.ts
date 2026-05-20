// Open a new incident.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { INCIDENT_TYPES, INCIDENT_SEVERITIES, openIncident } from "@/lib/services/incident";

const Body = z.object({
  organizationId: z.string().min(1).optional().nullable(),
  companyId: z.string().min(1).optional().nullable(),
  planId: z.string().min(1).optional().nullable(),
  incidentType: z.enum(INCIDENT_TYPES),
  severity: z.enum(INCIDENT_SEVERITIES),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  detectedAt: z.string().min(8),
});

export const POST = apiHandler(
  { bodySchema: Body, idempotent: true },
  async ({ body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    const result = await openIncident({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      organizationId: body.organizationId,
      companyId: body.companyId,
      planId: body.planId,
      incidentType: body.incidentType,
      severity: body.severity,
      title: body.title,
      description: body.description,
      detectedAt: new Date(body.detectedAt),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(result, { status: 201 });
  },
);
