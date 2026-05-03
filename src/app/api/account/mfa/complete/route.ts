import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { completeMfaEnrollment } from "@/lib/auth/mfa";
import { requireActor } from "@/lib/session";

const Body = z.object({
  code: z.string().min(6).max(10),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  const actor = await requireActor();
  const result = await completeMfaEnrollment({
    organizationId: actor.organizationId,
    userId: actor.userId,
    code: body.code,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return NextResponse.json(result);
});
