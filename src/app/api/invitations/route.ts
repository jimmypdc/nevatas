import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { ROLES } from "@/lib/rbac/roles";
import { requireActor } from "@/lib/session";
import { createInvitation, listInvitations } from "@/lib/services/invitations";

export const GET = apiHandler({}, async () => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.userInvite);
  const invites = await listInvitations(actor.organizationId);
  return NextResponse.json({
    invitations: invites.map((i) => ({
      id: i.id,
      email: i.emailLower,
      roleKey: i.role.key,
      roleName: i.role.name,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
  });
});

const Body = z.object({
  email: z.string().email(),
  roleKey: z.enum([
    ROLES.firmAdmin,
    ROLES.firmOperationsUser,
    ROLES.planSponsorAdmin,
    ROLES.planSponsorApprover,
    ROLES.payrollAdmin,
    ROLES.readOnlyAuditor,
  ]),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.userInvite);

  const result = await createInvitation({
    organizationId: actor.organizationId,
    inviterUserId: actor.userId,
    email: body.email,
    roleKey: body.roleKey,
    appUrl: env().APP_URL,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return NextResponse.json(result, { status: 201 });
});
