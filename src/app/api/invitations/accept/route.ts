import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { acceptInvitation } from "@/lib/services/invitations";

const Body = z.object({
  token: z.string().min(1).max(512),
  // Required when the invited email has no existing user; ignored otherwise.
  name: z.string().min(1).max(200).optional(),
  password: z.string().min(1).max(512).optional(),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  const result = await acceptInvitation({
    rawToken: body.token,
    name: body.name,
    password: body.password,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return NextResponse.json(result, { status: 201 });
});
