// File preview. Returns the first N + last N lines of a generated
// contribution file so the sponsor can verify what they're certifying
// before clicking Approve. Bytes round-trip through the app server because
// previews are user-visible and must be authorization-checked; the full
// download still streams from object storage.

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/check";
import { requireActor } from "@/lib/session";
import { storage } from "@/lib/storage";

const Params = z.object({ id: z.string().min(1) });
const PREVIEW_LINES = 10;
const MAX_PREVIEW_BYTES = 1 * 1024 * 1024; // 1 MB safety cap

export const GET = apiHandler({ paramsSchema: Params }, async ({ params }) => {
  const actor = await requireActor();
  requirePermission(actor, PERMISSIONS.planRead);

  const file = await db.contributionFile.findUnique({
    where: { id: params.id },
    include: {
      payrollRun: {
        select: { plan: { select: { companyId: true, company: { select: { organizationId: true } } } } },
      },
    },
  });
  if (!file || file.payrollRun.plan.company.organizationId !== actor.organizationId) {
    throw notFound("Contribution file");
  }

  const bytes = await storage().getObject(file.storageKey);
  // For previewable formats (CSV / pipe-delimited text), split lines and
  // return head + tail. Truncate at MAX_PREVIEW_BYTES so a malformed file
  // doesn't blow out memory.
  const text = bytes.subarray(0, MAX_PREVIEW_BYTES).toString("utf8");
  const lines = text.split(/\r?\n/);
  // Drop trailing empty line that's just the file's terminating newline.
  const meaningful = lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  const totalLines = meaningful.length;
  const truncated = bytes.length > MAX_PREVIEW_BYTES;

  let head = meaningful.slice(0, PREVIEW_LINES);
  let tail: string[] = [];
  if (totalLines > PREVIEW_LINES * 2) {
    tail = meaningful.slice(-PREVIEW_LINES);
  } else if (totalLines > PREVIEW_LINES) {
    head = meaningful.slice(0, totalLines);
  }

  return NextResponse.json({
    fileId: file.id,
    version: file.version,
    format: file.format,
    sizeBytes: bytes.length,
    totalLines,
    truncated,
    head,
    tail,
  });
});
