// Create a new security policy with its v1 content.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { createSecurityPolicy } from "@/lib/services/security-policy";

const Body = z.object({
  key: z.string().min(3).max(64),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  initialContent: z.string().min(1),
  initialChangeSummary: z.string().optional(),
});

export const POST = apiHandler(
  { bodySchema: Body, idempotent: true },
  async ({ body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    const r = await createSecurityPolicy({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      key: body.key,
      name: body.name,
      description: body.description,
      initialContent: body.initialContent,
      initialChangeSummary: body.initialChangeSummary,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(r, { status: 201 });
  },
);
