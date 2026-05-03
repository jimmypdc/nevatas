import { NextResponse } from "next/server";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";

export const GET = apiHandler({}, async () => {
  const actor = await requireActor();
  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, email: true, name: true, mfaEnabled: true },
  });
  return NextResponse.json({
    user,
    organizationId: actor.organizationId,
    role: actor.roleKey,
    permissions: Array.from(actor.permissions),
  });
});
