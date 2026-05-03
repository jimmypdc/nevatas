import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { requireActor } from "@/lib/session";
import { switchActiveOrganization } from "@/lib/services/organizations";

const Body = z.object({
  organizationId: z.string().min(1),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  const actor = await requireActor();
  await switchActiveOrganization({
    userId: actor.userId,
    fromOrganizationId: actor.organizationId,
    toOrganizationId: body.organizationId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return NextResponse.json({ ok: true, activeOrganizationId: body.organizationId });
});
