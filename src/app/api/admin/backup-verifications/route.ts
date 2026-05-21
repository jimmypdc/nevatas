// Backup pipeline ingest. Bearer-token authenticated (NOT session); the
// pipeline runs as cron / CI / a worker so it has no NextAuth session.
// Refuses the request when BACKUP_REPORT_SECRET isn't configured —
// default-deny.

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { validationError } from "@/lib/errors";
import {
  assertBackupReportAuth,
  recordBackupVerification,
} from "@/lib/services/backup-verification";

const Body = z.object({
  source: z.string().min(1).max(200),
  status: z.enum(["success", "failure"]),
  sizeBytes: z
    .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
    .optional()
    .nullable(),
  durationMs: z.number().int().nonnegative().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  reportedAt: z.string().min(8).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  assertBackupReportAuth(req.headers.get("authorization"));

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw validationError("Request body must be JSON");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    throw validationError("Invalid request body", parsed.error.flatten());
  }

  const sizeBytes =
    typeof parsed.data.sizeBytes === "string"
      ? BigInt(parsed.data.sizeBytes)
      : typeof parsed.data.sizeBytes === "number"
        ? parsed.data.sizeBytes
        : null;

  const result = await recordBackupVerification({
    source: parsed.data.source,
    status: parsed.data.status,
    sizeBytes,
    durationMs: parsed.data.durationMs ?? null,
    errorMessage: parsed.data.errorMessage ?? null,
    notes: parsed.data.notes ?? null,
    metadata: parsed.data.metadata ?? null,
    reportedAt: parsed.data.reportedAt ? new Date(parsed.data.reportedAt) : undefined,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json(
    {
      id: result.id,
      source: result.source,
      status: result.status,
      reportedAt: result.reportedAt.toISOString(),
    },
    { status: 201 },
  );
}
