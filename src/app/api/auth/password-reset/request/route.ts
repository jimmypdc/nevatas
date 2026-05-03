// Public, unauthenticated endpoint. Always returns 200 even when the email
// doesn't match a real account — disclosing existence would let an attacker
// enumerate valid accounts. The Edge middleware rate-limits per IP.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { requestPasswordReset } from "@/lib/auth/password-reset";

const Body = z.object({
  email: z.string().email(),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  await requestPasswordReset({
    email: body.email,
    appUrl: env().APP_URL,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  // Always 200; do not reveal whether the email matched a real account.
  return NextResponse.json({ ok: true });
});
