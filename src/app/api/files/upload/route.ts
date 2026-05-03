import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { validationError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { uploadPayrollFile } from "@/lib/services/file-upload";

const ALLOWED_IMPORT_TYPES = [
  "census",
  "contribution",
  "deferral_election",
  "loan_repayment",
  "payroll_register",
  "eligibility",
] as const;

const MetaSchema = z.object({
  companyId: z.string().min(1),
  importType: z.enum(ALLOWED_IMPORT_TYPES),
});

export const POST = apiHandler({}, async ({ req, ctx }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.payrollFileUpload);

  const form = await req.formData();
  const meta = MetaSchema.safeParse({
    companyId: form.get("companyId"),
    importType: form.get("importType"),
  });
  if (!meta.success) {
    throw validationError("Missing or invalid form fields", meta.error.flatten());
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw validationError("file is required");
  }

  const arrayBuffer = await file.arrayBuffer();
  const result = await uploadPayrollFile({
    organizationId: actor.organizationId,
    companyId: meta.data.companyId,
    uploadedById: actor.userId,
    fileName: file.name,
    mimeType: file.type || "text/csv",
    importType: meta.data.importType,
    bytes: Buffer.from(arrayBuffer),
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return NextResponse.json(result, { status: 201 });
});
