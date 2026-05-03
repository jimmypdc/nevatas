import { NextResponse } from "next/server";

import { apiHandler } from "@/lib/api-handler";
import { beginMfaEnrollment } from "@/lib/auth/mfa";
import { requireActor } from "@/lib/session";

export const POST = apiHandler({ idempotent: true }, async ({ ctx }) => {
  const actor = await requireActor();
  const result = await beginMfaEnrollment({
    organizationId: actor.organizationId,
    userId: actor.userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return NextResponse.json(result, { status: 201 });
});
