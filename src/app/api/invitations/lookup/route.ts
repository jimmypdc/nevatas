// Public lookup of an invitation by raw token. No session required — the
// token IS the auth. Returns a UI-safe summary (does not leak the inviter's
// email or other org members).

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { lookupInvitationByToken } from "@/lib/services/invitations";

const Body = z.object({
  token: z.string().min(1).max(512),
});

// POST so the token is in the body, not the URL — query strings end up in
// access logs / referrer headers; bodies don't.
export const POST = apiHandler({ bodySchema: Body }, async ({ body }) => {
  const summary = await lookupInvitationByToken(body.token);
  return NextResponse.json(summary);
});
