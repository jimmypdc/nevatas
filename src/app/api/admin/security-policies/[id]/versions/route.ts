// Publish a new version of an existing policy. Auto-supersedes prior
// active version in one transaction.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { publishNewVersion } from "@/lib/services/security-policy";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  content: z.string().min(1),
  changeSummary: z.string().min(1),
});

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, body, ctx }) => {
    const actor = await requireActor();
    requirePermission(actor, PERMISSIONS.platformImpersonate);

    const r = await publishNewVersion({
      actorUserId: actor.userId,
      actorOrganizationId: actor.organizationId,
      policyId: params.id,
      content: body.content,
      changeSummary: body.changeSummary,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(r, { status: 201 });
  },
);
