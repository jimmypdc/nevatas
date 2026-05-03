// Job handler: run a malware scan against a stored source file. Delegates
// to the synchronous service so the same logic runs whether scans happen
// inline (tests, dev) or via the worker (production).

import { JOB_TYPES, registerHandler } from "@/lib/jobs/registry";
import { PermanentJobFailure } from "@/lib/jobs/types";
import { db } from "@/lib/db";
import { runScanForSourceFile } from "@/lib/services/file-scan";

registerHandler(JOB_TYPES.scanFile, async (payload, ctx) => {
  // Defensive: confirm the file still exists. A deleted file is a
  // permanent failure — no amount of retry will recover.
  const file = await db.payrollSourceFile.findUnique({
    where: { id: payload.sourceFileId },
    select: { id: true, companyId: true },
  });
  if (!file) {
    throw new PermanentJobFailure(`Source file ${payload.sourceFileId} no longer exists`);
  }

  await runScanForSourceFile({
    organizationId: ctx.organizationId,
    companyId: ctx.companyId ?? file.companyId,
    actorUserId: ctx.actorUserId ?? undefined,
    sourceFileId: payload.sourceFileId,
    requestId: ctx.requestId ?? undefined,
  });
});
