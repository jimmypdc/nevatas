// Two-phase direct-browser upload service.
//
// Phase 1: initUpload — server validates the request, generates a unique
//   storage key, persists a PendingUpload row, returns a presigned URL the
//   browser PUTs the bytes directly to. Bytes never touch this server.
//
// Phase 2: completeUpload — the browser tells the server the upload finished;
//   the server confirms the object's existence + size + checksum via S3
//   HeadObject (or a dev-only filesystem stat for the local driver), then
//   creates the PayrollSourceFile row and writes the audit event.

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notFound, validationError } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs/queue";
import { JOB_TYPES } from "@/lib/jobs/registry";
import { scanner } from "@/lib/scanning";
import { runScanForSourceFile } from "@/lib/services/file-scan";
import { storage } from "@/lib/storage";
import { payrollSourceKey } from "@/lib/storage/keys";
import type { SignedUploadResult } from "@/lib/storage/driver";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "text/plain",
  "application/csv",
]);
const ALLOWED_IMPORT_TYPES = [
  "census",
  "contribution",
  "deferral_election",
  "loan_repayment",
  "payroll_register",
  "eligibility",
] as const;

export type InitUploadInput = {
  organizationId: string;
  companyId: string;
  uploadedById: string;
  fileName: string;
  mimeType: string;
  importType: (typeof ALLOWED_IMPORT_TYPES)[number];
  sizeBytes: number;
  sha256Hex: string;
};

export type InitUploadResult = {
  pendingUploadId: string;
  storageKey: string;
  upload: SignedUploadResult;
};

export async function initDirectUpload(input: InitUploadInput): Promise<InitUploadResult> {
  if (input.sizeBytes <= 0) throw validationError("File size must be greater than zero");
  if (input.sizeBytes > MAX_FILE_BYTES) {
    throw validationError(`File exceeds maximum size of ${MAX_FILE_BYTES} bytes`);
  }
  if (!ALLOWED_MIME.has(input.mimeType.toLowerCase())) {
    throw validationError(`Unsupported MIME type: ${input.mimeType}`);
  }
  if (!/\.csv$/i.test(input.fileName)) {
    throw validationError("Only .csv files are accepted");
  }
  if (!/^[a-f0-9]{64}$/.test(input.sha256Hex.toLowerCase())) {
    throw validationError("sha256Hex must be 64 hex characters");
  }
  if (!ALLOWED_IMPORT_TYPES.includes(input.importType)) {
    throw validationError(`Unknown importType: ${input.importType}`);
  }

  // Tenant scope check.
  const company = await db.company.findFirst({
    where: { id: input.companyId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!company) throw notFound("Company");

  const id = randomUUID();
  const storageKey = payrollSourceKey({
    companyId: input.companyId,
    fileId: id,
    fileName: input.fileName,
  });

  const upload = await storage().signedUploadUrl({
    key: storageKey,
    contentType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sha256Hex: input.sha256Hex,
  });

  await db.pendingUpload.create({
    data: {
      id,
      organizationId: input.organizationId,
      companyId: input.companyId,
      uploadedById: input.uploadedById,
      fileName: input.fileName,
      mimeType: input.mimeType,
      importType: input.importType,
      sizeBytes: input.sizeBytes,
      sha256Hex: input.sha256Hex.toLowerCase(),
      storageKey,
      expiresAt: new Date(upload.expiresAt),
    },
  });

  return { pendingUploadId: id, storageKey, upload };
}

export type CompleteUploadInput = {
  organizationId: string;
  companyId: string;
  actorUserId: string;
  pendingUploadId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type CompleteUploadResult = {
  sourceFileId: string;
  storageKey: string;
  checksum: string;
  sizeBytes: number;
  // Reflects the state of the file at the moment upload-complete returns.
  // The malware scan runs asynchronously via a background job; the client
  // should poll GET /api/files/:id/status until scanStatus becomes "clean"
  // / "skipped" / "infected" / "error" before invoking parse.
  scanStatus: "pending" | "clean" | "skipped" | "infected" | "error";
};

export async function completeDirectUpload(
  input: CompleteUploadInput,
): Promise<CompleteUploadResult> {
  const pending = await db.pendingUpload.findUnique({ where: { id: input.pendingUploadId } });
  if (!pending) throw notFound("Pending upload");
  if (pending.organizationId !== input.organizationId) throw notFound("Pending upload");
  if (pending.companyId !== input.companyId) throw notFound("Pending upload");
  if (pending.uploadedById !== input.actorUserId) throw notFound("Pending upload");
  if (pending.status !== "pending") {
    throw validationError(`Pending upload is in status "${pending.status}"`);
  }
  if (pending.expiresAt < new Date()) {
    await db.pendingUpload.update({
      where: { id: pending.id },
      data: { status: "expired" },
    });
    throw validationError("Upload window expired; restart the upload");
  }

  // Server-side confirmation that the bytes actually landed in storage with
  // the size + checksum we expected. S3 returns the verified checksum from
  // its native ChecksumSHA256 support; the local dev driver computes it on
  // the fly.
  const head = await storage().headObject(pending.storageKey);
  if (head.sizeBytes !== pending.sizeBytes) {
    throw validationError(
      `Uploaded size ${head.sizeBytes} does not match the size declared at init (${pending.sizeBytes})`,
    );
  }
  if (head.sha256Hex && head.sha256Hex.toLowerCase() !== pending.sha256Hex) {
    throw validationError("Uploaded SHA-256 does not match the checksum declared at init");
  }

  const result = await db.$transaction(async (tx) => {
    const sourceFile = await tx.payrollSourceFile.create({
      data: {
        id: pending.id, // reuse the id so the storage key + DB row align
        companyId: pending.companyId,
        fileName: pending.fileName,
        storageKey: pending.storageKey,
        checksum: pending.sha256Hex,
        mimeType: pending.mimeType,
        sizeBytes: pending.sizeBytes,
        importType: pending.importType,
        uploadedById: pending.uploadedById,
        status: "uploaded",
      },
    });

    await tx.pendingUpload.update({
      where: { id: pending.id },
      data: { status: "completed", completedAt: new Date() },
    });

    await writeAudit(
      {
        organizationId: pending.organizationId,
        companyId: pending.companyId,
        actorUserId: pending.uploadedById,
        action: AUDIT_ACTIONS.fileUploaded,
        entityType: "payroll_source_file",
        entityId: sourceFile.id,
        after: {
          fileName: sourceFile.fileName,
          sizeBytes: sourceFile.sizeBytes,
          checksum: sourceFile.checksum,
          importType: sourceFile.importType,
        },
        metadata: { mimeType: pending.mimeType, deliveryMode: "direct_upload" },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx as Prisma.TransactionClient,
    );

    return sourceFile;
  });

  // Scan path branches on the configured driver:
  //   - noop : runs inline. Trivial / synchronous; enqueuing for it would
  //            mean dev needs the worker process running just to upload a
  //            file. Returns the verdict on this same response.
  //   - real : enqueues a background job; UI polls /status until verdict.
  //            Required because real scanners (ClamAV / GuardDuty) take
  //            seconds to minutes and would otherwise block the response.
  const driver = scanner();
  let scanStatus: "pending" | "clean" | "skipped" | "infected" | "error";
  if (driver.name === "noop") {
    const verdict = await runScanForSourceFile({
      organizationId: input.organizationId,
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      sourceFileId: result.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });
    scanStatus = verdict.verdict as typeof scanStatus;
  } else {
    await enqueueJob({
      jobType: JOB_TYPES.scanFile,
      payload: { sourceFileId: result.id },
      context: {
        organizationId: input.organizationId,
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        requestId: input.requestId ?? null,
      },
      idempotencyKey: `scan:${result.id}`,
    });
    scanStatus = "pending";
  }

  return {
    sourceFileId: result.id,
    storageKey: result.storageKey,
    checksum: result.checksum,
    sizeBytes: result.sizeBytes,
    scanStatus,
  };
}
