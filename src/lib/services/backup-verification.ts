// Backup verification ingest + status helpers.
//
// Ingest is open to any caller with the BACKUP_REPORT_SECRET Bearer token
// (not session auth) — the backup pipeline runs as cron / CI / a worker
// process that doesn't have a user session. We compare the token with
// timingSafeEqual so a length-mismatch path doesn't leak via timing.
//
// The "expected sources" config (env.BACKUP_EXPECTED_SOURCES) drives the
// missing-ping detection on the evidence center. When unset, the evidence
// center simply shows whatever has reported — useful for dev / demo —
// but production should set the expected list so a silent pipeline
// failure surfaces as a red tile after STALE_AFTER_HOURS.

import { timingSafeEqual } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { env } from "@/lib/env";
import { unauthenticated, validationError } from "@/lib/errors";

export const STALE_AFTER_HOURS = 24;

export type RecordBackupVerificationInput = {
  source: string;
  status: "success" | "failure";
  sizeBytes?: bigint | number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  reportedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
};

export type RecordBackupVerificationResult = {
  id: string;
  source: string;
  status: string;
  reportedAt: Date;
};

export async function recordBackupVerification(
  input: RecordBackupVerificationInput,
): Promise<RecordBackupVerificationResult> {
  if (!input.source.trim()) throw validationError("source is required");
  if (input.status === "failure" && !input.errorMessage?.trim()) {
    throw validationError("errorMessage is required when status is failure");
  }

  const reportedAt = input.reportedAt ?? new Date();
  if (reportedAt.getTime() > Date.now() + 60_000) {
    throw validationError("reportedAt cannot be in the future");
  }

  const sizeBytes =
    typeof input.sizeBytes === "bigint"
      ? input.sizeBytes
      : typeof input.sizeBytes === "number"
        ? BigInt(Math.floor(input.sizeBytes))
        : null;

  const created = await db.backupVerification.create({
    data: {
      source: input.source.trim(),
      status: input.status,
      sizeBytes,
      durationMs: input.durationMs ?? null,
      errorMessage: input.errorMessage?.trim() || null,
      notes: input.notes?.trim() || null,
      metadataJson: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      reportedAt,
    },
  });

  // The pipeline isn't a user session, so there's no organization or
  // actor to attribute against. We anchor the audit row to the first
  // organization (typical single-tenant pattern). In a multi-tenant
  // platform with no obvious anchor, skip the audit row — the
  // BackupVerification row itself is the SOC 2 evidence; the audit log
  // isn't load-bearing here.
  const anchorOrg = await db.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (anchorOrg) {
    await writeAudit({
      organizationId: anchorOrg.id,
      actorType: "system",
      action: AUDIT_ACTIONS.backupVerificationRecorded,
      entityType: "backup_verification",
      entityId: created.id,
      metadata: {
        source: created.source,
        status: created.status,
        sizeBytes: sizeBytes === null ? null : String(sizeBytes),
        durationMs: created.durationMs,
        reportedAt: created.reportedAt.toISOString(),
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }

  return {
    id: created.id,
    source: created.source,
    status: created.status,
    reportedAt: created.reportedAt,
  };
}

export type BackupSourceStatus = {
  source: string;
  // null when the source is "expected but never reported".
  latest: {
    id: string;
    status: string;
    reportedAt: Date;
    sizeBytes: bigint | null;
    durationMs: number | null;
    errorMessage: string | null;
  } | null;
  // Derived from the latest report relative to STALE_AFTER_HOURS.
  health: "healthy" | "stale" | "failed" | "never";
  expected: boolean;
};

// Returns one row per UNION(expected sources, observed sources). Health
// classifies the source for the dashboard:
//   - never   — never reported (expected source with no row at all)
//   - failed  — latest report has status=failure
//   - stale   — latest report is older than STALE_AFTER_HOURS
//   - healthy — latest report is success AND fresh
export async function getLatestBackupStatuses(): Promise<BackupSourceStatus[]> {
  const expected = env()
    .BACKUP_EXPECTED_SOURCES.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Pull the latest row per source via DISTINCT ON. Falling back to a
  // Prisma groupBy + per-source query would work but the raw query keeps
  // it one round trip.
  type Row = {
    id: string;
    source: string;
    status: string;
    reportedAt: Date;
    sizeBytes: bigint | null;
    durationMs: number | null;
    errorMessage: string | null;
  };
  const rows = await db.$queryRawUnsafe<Row[]>(
    `
    SELECT DISTINCT ON (source)
      id, source, status, "reportedAt", "sizeBytes", "durationMs", "errorMessage"
    FROM "BackupVerification"
    ORDER BY source ASC, "reportedAt" DESC
    `,
  );

  const bySource = new Map<string, Row>();
  for (const r of rows) bySource.set(r.source, r);

  const observedSources = [...bySource.keys()];
  const allSources = Array.from(new Set([...expected, ...observedSources])).sort();
  const now = Date.now();
  const staleCutoff = now - STALE_AFTER_HOURS * 3600_000;

  return allSources.map((source): BackupSourceStatus => {
    const row = bySource.get(source);
    const isExpected = expected.includes(source);
    if (!row) {
      return { source, latest: null, health: "never", expected: isExpected };
    }
    const health: BackupSourceStatus["health"] =
      row.status !== "success"
        ? "failed"
        : row.reportedAt.getTime() < staleCutoff
          ? "stale"
          : "healthy";
    return {
      source,
      latest: {
        id: row.id,
        status: row.status,
        reportedAt: row.reportedAt,
        sizeBytes: row.sizeBytes,
        durationMs: row.durationMs,
        errorMessage: row.errorMessage,
      },
      health,
      expected: isExpected,
    };
  });
}

// Constant-time Bearer-token check. Returns true on match; throws
// unauthenticated() on mismatch or when BACKUP_REPORT_SECRET isn't
// configured (default-deny — better to refuse than to silently accept).
export function assertBackupReportAuth(authHeader: string | null): void {
  const secret = env().BACKUP_REPORT_SECRET;
  if (!secret) {
    throw unauthenticated("BACKUP_REPORT_SECRET is not configured on this server");
  }
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw unauthenticated("Bearer token required");
  }
  const supplied = authHeader.slice("Bearer ".length);
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw unauthenticated("Invalid Bearer token");
  }
}
