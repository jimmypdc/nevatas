import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { completePasswordReset } from "@/lib/auth/password-reset";

const Body = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(1).max(512),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  await completePasswordReset({
    token: body.token,
    newPassword: body.password,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return NextResponse.json({ ok: true });
});
