import { NextResponse } from "next/server";

import { apiHandler } from "@/lib/api-handler";
import { unauthenticated } from "@/lib/errors";
import { getCurrentUserId } from "@/lib/session";
import { stopImpersonation } from "@/lib/services/impersonation";

// Stop the current impersonation. Reads the underlying NextAuth session
// (NOT requireActor — that returns the impersonated identity) so the admin
// can always end their own session even if the cookie/row is in a weird
// state.
export const POST = apiHandler({}, async ({ ctx }) => {
  const adminUserId = await getCurrentUserId();
  if (!adminUserId) throw unauthenticated();

  const result = await stopImpersonation({
    adminUserId,
    endedReason: "stopped_by_admin",
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return NextResponse.json(result);
});
