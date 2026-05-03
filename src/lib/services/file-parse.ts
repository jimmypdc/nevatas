// Service: parse a previously-uploaded CSV file. Reads from storage, persists
// raw rows verbatim into SourceRow, suggests a column mapping. Does not
// normalize or validate yet — that happens when a payroll run is created
// against the file.

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { parseCsv, suggestMapping } from "@/lib/normalization/csv";
import { CONTRIBUTION_FIELDS } from "@/lib/normalization/contribution-fields";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";
import { isFileReleased } from "@/lib/services/file-scan";

export type ParseInput = {
  organizationId: string;
  companyId: string;
  actorUserId: string;
  sourceFileId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type ParseResult = {
  sourceFileId: string;
  rowCount: number;
  headers: string[];
  suggestedMapping: Record<string, string>;
  parseErrors: { row: number; message: string }[];
};

export async function parseSourceFile(input: ParseInput): Promise<ParseResult> {
  const file = await db.payrollSourceFile.findUnique({
    where: { id: input.sourceFileId },
  });
  if (!file) throw notFound("Source file");
  if (file.companyId !== input.companyId) throw notFound("Source file");

  // Refuse to parse a file that hasn't been cleared by the malware scanner.
  // An authorized user (payroll_file.scan.override) can record a documented
  // override on the source file, which flips this check (see file-scan.ts).
  if (!isFileReleased({ scanStatus: file.scanStatus, scanOverrideAt: file.scanOverrideAt })) {
    throw blockedByPolicy(
      `File scan status is "${file.scanStatus}". Resolve or override before parsing.`,
      { scanStatus: file.scanStatus, scanProvider: file.scanProvider },
    );
  }

  const bytes = await storage().getObject(file.storageKey);
  const text = bytes.toString("utf8");
  const parsed = parseCsv(text);

  if (parsed.headers.length === 0) {
    throw validationError("CSV has no header row");
  }

  // Persist raw rows verbatim. Wipe any prior parse output for this file —
  // the source bytes are immutable, so re-parsing always produces the same
  // result; this is safe and supports retry after fixing infrastructure.
  await db.$transaction(async (tx) => {
    await tx.sourceRow.deleteMany({ where: { sourceFileId: file.id } });
    if (parsed.rows.length > 0) {
      await tx.sourceRow.createMany({
        data: parsed.rows.map((row, idx) => ({
          sourceFileId: file.id,
          rowIndex: idx,
          rawJson: row,
        })),
      });
    }
    await tx.payrollSourceFile.update({
      where: { id: file.id },
      data: {
        status: "parsed",
        parseError: parsed.errors.length > 0 ? JSON.stringify(parsed.errors).slice(0, 4000) : null,
      },
    });
  });

  await writeAudit({
    organizationId: input.organizationId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: AUDIT_ACTIONS.fileParsed,
    entityType: "payroll_source_file",
    entityId: file.id,
    metadata: {
      headerCount: parsed.headers.length,
      rowCount: parsed.rows.length,
      parseErrorCount: parsed.errors.length,
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });

  return {
    sourceFileId: file.id,
    rowCount: parsed.rows.length,
    headers: parsed.headers,
    suggestedMapping: suggestMapping(parsed.headers, CONTRIBUTION_FIELDS),
    parseErrors: parsed.errors,
  };
}
