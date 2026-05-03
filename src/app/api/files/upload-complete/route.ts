import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { completeDirectUpload } from "@/lib/services/file-upload-direct";

const Body = z.object({
  pendingUploadId: z.string().min(1),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body, ctx }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.payrollFileUpload);

  // Tenant scoping is enforced inside completeDirectUpload, but verify the
  // pendingUploadId is at least visible from this org before exposing service
  // errors that might leak existence.
  const pending = await db.pendingUpload.findUnique({
    where: { id: body.pendingUploadId },
    select: { organizationId: true, companyId: true },
  });
  if (!pending || pending.organizationId !== actor.organizationId) {
    throw notFound("Pending upload");
  }

  const result = await completeDirectUpload({
    organizationId: actor.organizationId,
    companyId: pending.companyId,
    actorUserId: actor.userId,
    pendingUploadId: body.pendingUploadId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return NextResponse.json(result, { status: 201 });
});
