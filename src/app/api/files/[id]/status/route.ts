// File status polling endpoint. The upload-complete response leaves the
// scan in "pending"; the client polls this endpoint until the verdict
// resolves before invoking parse.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";

const Params = z.object({ id: z.string().min(1) });

export const GET = apiHandler({ paramsSchema: Params }, async ({ params }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.payrollFileUpload);

  const file = await db.payrollSourceFile.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      scanStatus: true,
      scanProvider: true,
      scanCompletedAt: true,
      scanOverrideAt: true,
      company: { select: { organizationId: true } },
    },
  });
  if (!file || file.company.organizationId !== actor.organizationId) {
    throw notFound("Source file");
  }

  return NextResponse.json({
    id: file.id,
    status: file.status,
    scanStatus: file.scanStatus,
    scanProvider: file.scanProvider,
    scanCompletedAt: file.scanCompletedAt,
    scanOverrideAt: file.scanOverrideAt,
  });
});
