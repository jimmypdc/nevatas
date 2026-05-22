// User-facing acknowledgment endpoint. Session-gated (any authenticated
// user), not permission-gated — every active member must be able to
// acknowledge policies.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { requireActor } from "@/lib/session";
import { acknowledgePolicyVersion } from "@/lib/services/security-policy";

const Params = z.object({ versionId: z.string().min(1) });
const Body = z.object({ confirmed: z.literal(true) });

export const POST = apiHandler(
  { paramsSchema: Params, bodySchema: Body, idempotent: true },
  async ({ params, ctx }) => {
    const actor = await requireActor();

    const r = await acknowledgePolicyVersion({
      userId: actor.userId,
      organizationId: actor.organizationId,
      policyVersionId: params.versionId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return NextResponse.json(r, { status: 201 });
  },
);
