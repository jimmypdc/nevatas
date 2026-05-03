// Service: secure CSV upload. Hashes bytes, persists to object storage,
// records the source-file row, writes audit. Caller is responsible for
// authn/authz. Storage write happens before DB insert so we never have a
// SourceFile row pointing at missing bytes; orphaned blobs are cleaned by a
// background sweeper (Phase 5).

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto/hashing";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { payrollSourceKey } from "@/lib/storage/keys";
import { validationError } from "@/lib/errors";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME = new Set(["text/csv", "application/vnd.ms-excel", "text/plain", "application/csv"]);

export type UploadInput = {
  organizationId: string;
  companyId: string;
  uploadedById: string;
  fileName: string;
  mimeType: string;
  importType: "census" | "contribution" | "deferral_election" | "loan_repayment" | "payroll_register" | "eligibility";
  bytes: Buffer;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type UploadResult = {
  sourceFileId: string;
  storageKey: string;
  checksum: string;
  sizeBytes: number;
};

export async function uploadPayrollFile(input: UploadInput): Promise<UploadResult> {
  if (input.bytes.length === 0) throw validationError("Uploaded file is empty");
  if (input.bytes.length > MAX_FILE_BYTES) {
    throw validationError(`File exceeds maximum size of ${MAX_FILE_BYTES} bytes`);
  }
  if (!ALLOWED_MIME.has(input.mimeType.toLowerCase())) {
    throw validationError(`Unsupported MIME type: ${input.mimeType}`);
  }
  if (!/\.csv$/i.test(input.fileName)) {
    throw validationError("Only .csv files are accepted in MVP");
  }

  const id = randomUUID();
  const checksum = sha256Hex(input.bytes);
  const storageKey = payrollSourceKey({
    companyId: input.companyId,
    fileId: id,
    fileName: input.fileName,
  });

  await storage().putObject({
    key: storageKey,
    body: input.bytes,
    contentType: input.mimeType,
  });

  const sourceFile = await db.payrollSourceFile.create({
    data: {
      id,
      companyId: input.companyId,
      fileName: input.fileName,
      storageKey,
      checksum,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.length,
      importType: input.importType,
      uploadedById: input.uploadedById,
      status: "uploaded",
    },
  });

  await writeAudit({
    organizationId: input.organizationId,
    companyId: input.companyId,
    actorUserId: input.uploadedById,
    action: AUDIT_ACTIONS.fileUploaded,
    entityType: "payroll_source_file",
    entityId: sourceFile.id,
    after: {
      fileName: sourceFile.fileName,
      sizeBytes: sourceFile.sizeBytes,
      checksum: sourceFile.checksum,
      importType: sourceFile.importType,
    },
    metadata: { mimeType: input.mimeType },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });

  return {
    sourceFileId: sourceFile.id,
    storageKey,
    checksum,
    sizeBytes: input.bytes.length,
  };
}
