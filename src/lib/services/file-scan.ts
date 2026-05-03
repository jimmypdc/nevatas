// File-scan service. Owns the scanStatus state machine on PayrollSourceFile.
//
// In Phase 1 the scanner runs synchronously inline with upload-complete (the
// noop driver returns immediately; ClamAV streams the bytes). Once the
// background job runner from P1 #3 lands, this service moves behind a queue
// so a slow scanner doesn't block the upload-complete response — call sites
// stay the same.

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { scanner } from "@/lib/scanning";

export type RunScanInput = {
  organizationId: string;
  companyId: string;
  actorUserId?: string;
  sourceFileId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function runScanForSourceFile(input: RunScanInput): Promise<{
  verdict: string;
  provider: string;
}> {
  const file = await db.payrollSourceFile.findUnique({
    where: { id: input.sourceFileId },
    select: { id: true, companyId: true, storageKey: true, sizeBytes: true, mimeType: true },
  });
  if (!file) throw notFound("Source file");

  const sc = scanner();
  let result;
  try {
    result = await sc.scan({
      storageKey: file.storageKey,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
    });
  } catch (err) {
    // Scanner internal failure (network, daemon down). Persist as "error"
    // so the operator sees it; do not throw — the upload itself succeeded.
    await db.payrollSourceFile.update({
      where: { id: file.id },
      data: {
        scanStatus: "error",
        scanProvider: sc.name,
        scanCompletedAt: new Date(),
        scanResult: { error: err instanceof Error ? err.message : String(err) },
      },
    });
    await writeAudit({
      organizationId: input.organizationId,
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: AUDIT_ACTIONS.fileScanFailed,
      entityType: "payroll_source_file",
      entityId: file.id,
      metadata: { provider: sc.name, error: err instanceof Error ? err.message : String(err) },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });
    return { verdict: "error", provider: sc.name };
  }

  await db.payrollSourceFile.update({
    where: { id: file.id },
    data: {
      scanStatus: result.verdict,
      scanProvider: result.provider,
      scanCompletedAt: new Date(),
      scanResult: result.details
        ? (result.details as Prisma.InputJsonValue)
        : undefined,
    },
  });
  await writeAudit({
    organizationId: input.organizationId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: AUDIT_ACTIONS.fileScanCompleted,
    entityType: "payroll_source_file",
    entityId: file.id,
    metadata: { provider: result.provider, verdict: result.verdict },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });
  return { verdict: result.verdict, provider: result.provider };
}

export type OverrideScanInput = {
  organizationId: string;
  companyId: string;
  actorUserId: string;
  sourceFileId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

// Authorized override: marks a non-clean file as proceedable. Captures the
// actor + reason for the audit trail. Caller must have payroll_file.scan.override.
export async function overrideScanVerdict(input: OverrideScanInput) {
  if (input.reason.trim().length < 10) {
    throw new Error("Scan override reason must be at least 10 characters");
  }
  const file = await db.payrollSourceFile.findUnique({
    where: { id: input.sourceFileId },
    select: { id: true, companyId: true, scanStatus: true },
  });
  if (!file || file.companyId !== input.companyId) throw notFound("Source file");
  if (file.scanStatus === "clean" || file.scanStatus === "skipped") {
    // No need to override; leave as-is.
    return file;
  }

  const updated = await db.$transaction(async (tx) => {
    const u = await tx.payrollSourceFile.update({
      where: { id: file.id },
      data: {
        scanOverrideById: input.actorUserId,
        scanOverrideReason: input.reason,
        scanOverrideAt: new Date(),
      },
    });
    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.fileScanOverridden,
        entityType: "payroll_source_file",
        entityId: file.id,
        before: { scanStatus: file.scanStatus },
        metadata: { reason: input.reason },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
    return u;
  });
  return updated;
}

// Centralized policy: returns true when the file is safe to release to
// downstream pipelines (parse, payroll-run creation). Honors operator
// overrides on infected/error/pending files.
export function isFileReleased(file: {
  scanStatus: string;
  scanOverrideAt: Date | null;
}): boolean {
  if (file.scanStatus === "clean" || file.scanStatus === "skipped") return true;
  return Boolean(file.scanOverrideAt);
}
