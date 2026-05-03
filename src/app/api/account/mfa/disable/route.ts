import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto/hashing";
import { disableMfa } from "@/lib/auth/mfa";
import { forbidden, validationError } from "@/lib/errors";
import { requireActor } from "@/lib/session";

const Body = z.object({
  // Re-confirm the password to disable MFA. Prevents an attacker who has
  // hijacked an authenticated session from removing the user's second factor.
  password: z.string().min(1),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  const actor = await requireActor();

  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: { passwordHash: true, mfaEnabled: true },
  });
  if (!user || !user.passwordHash) throw validationError("Account has no password set");
  if (!user.mfaEnabled) throw validationError("MFA is not currently enabled");

  const ok = await verifyPassword(user.passwordHash, body.password);
  if (!ok) throw forbidden("Password is incorrect");

  await disableMfa({
    organizationId: actor.organizationId,
    userId: actor.userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return NextResponse.json({ ok: true });
});
