import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { initDirectUpload } from "@/lib/services/file-upload-direct";

const Body = z.object({
  companyId: z.string().min(1),
  importType: z.enum([
    "census",
    "contribution",
    "deferral_election",
    "loan_repayment",
    "payroll_register",
    "eligibility",
  ]),
  fileName: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive(),
  sha256Hex: z.string().regex(/^[a-fA-F0-9]{64}$/),
});

export const POST = apiHandler({ bodySchema: Body, idempotent: true }, async ({ body }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.payrollFileUpload);

  const result = await initDirectUpload({
    organizationId: actor.organizationId,
    companyId: body.companyId,
    uploadedById: actor.userId,
    fileName: body.fileName,
    mimeType: body.mimeType,
    importType: body.importType,
    sizeBytes: body.sizeBytes,
    sha256Hex: body.sha256Hex,
  });

  return NextResponse.json(result, { status: 201 });
});
