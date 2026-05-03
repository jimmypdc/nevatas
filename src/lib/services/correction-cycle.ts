// Correction-cycle workflow. Per CLAUDE.md §8.6 ("Support for corrections and
// reversal files") and §10 ("Recordkeeping outputs must be locked after
// approval unless a correction cycle is opened").
//
// Lifecycle:
//   1. openCorrectionCycle — caller has identified a problem with an
//      approved / generated / submitted / accepted / rejected run.
//      Creates a new CorrectionCycle (only one open at a time per run),
//      invalidates the active sponsor approval, transitions the run back to
//      exception_review so issues can be re-resolved.
//
//   2. The operator resolves/waives issues and generates a new contribution
//      file. contribution-file.ts associates the new file with the open
//      correction cycle automatically (see correctionCycleId column).
//
//   3. The sponsor re-approves. approval.ts auto-closes the open cycle
//      (closeCorrectionCycleOnApproval) so the run lands in approved state
//      with the cycle marked closed.
//
//   4. Optionally a Firm Admin can abandon a cycle that turned out to be a
//      mistake (no new file generated yet). Out of Phase 1 scope.

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";
import { invalidateApprovalIfActive } from "@/lib/services/approval-invalidation";

// Statuses from which a correction cycle can be opened. "exception_review",
// "draft", and "validated" are pre-approval and don't need a correction cycle
// — the operator can just edit in place.
const CORRECTABLE_STATUSES = new Set([
  "approved",
  "generated",
  "submitted",
  "accepted",
  "rejected",
]);

export type OpenCorrectionInput = {
  organizationId: string;
  companyId: string;
  planId: string;
  actorUserId: string;
  payrollRunId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function openCorrectionCycle(input: OpenCorrectionInput) {
  if (input.reason.trim().length < 10) {
    throw validationError("Correction reason must be at least 10 characters");
  }

  const run = await db.payrollRun.findUnique({
    where: { id: input.payrollRunId },
    include: {
      contributionFiles: { orderBy: { version: "desc" }, take: 1 },
      correctionCycles: { where: { status: "open" }, take: 1 },
    },
  });
  if (!run) throw notFound("Payroll run");
  if (!CORRECTABLE_STATUSES.has(run.status)) {
    throw blockedByPolicy(
      `Cannot open a correction cycle on a run in status "${run.status}". ` +
        "Corrections are for already-approved or submitted runs.",
    );
  }
  if (run.correctionCycles.length > 0) {
    throw blockedByPolicy("A correction cycle is already open on this run");
  }

  const supersededFile = run.contributionFiles[0] ?? null;

  const created = await db.$transaction(async (tx) => {
    const cycle = await tx.correctionCycle.create({
      data: {
        payrollRunId: run.id,
        reason: input.reason,
        supersededFileId: supersededFile?.id ?? null,
        openedById: input.actorUserId,
      },
    });

    // Invalidate any active sponsor approval; transitions run to
    // exception_review and stamps approvalInvalidatedAt on the run.
    await invalidateApprovalIfActive(tx, {
      organizationId: input.organizationId,
      companyId: input.companyId,
      planId: input.planId,
      actorUserId: input.actorUserId,
      payrollRunId: run.id,
      reason: `Correction cycle ${cycle.id} opened: ${input.reason}`,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });

    // For runs that were past approval (e.g. submitted/accepted) and didn't
    // have an active approval to invalidate, the invalidation helper is a
    // no-op. Force the run back to exception_review here too so the operator
    // has a clean slate to resolve issues.
    await tx.payrollRun.update({
      where: { id: run.id },
      data: { status: "exception_review" },
    });

    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: input.companyId,
        planId: input.planId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.correctionCycleOpened,
        entityType: "correction_cycle",
        entityId: cycle.id,
        before: { status: run.status },
        after: {
          cycleId: cycle.id,
          supersededFileId: supersededFile?.id ?? null,
          supersededFileVersion: supersededFile?.version ?? null,
        },
        metadata: { reason: input.reason },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return cycle;
  });

  return created;
}

// Closes any currently-open correction cycle on this run. Called from the
// approval service after a sponsor re-approves a corrected file. Idempotent.
export async function closeCorrectionCycleOnApproval(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    companyId: string;
    planId: string;
    actorUserId: string;
    payrollRunId: string;
    contributionFileId: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  },
): Promise<void> {
  const open = await tx.correctionCycle.findFirst({
    where: { payrollRunId: params.payrollRunId, status: "open" },
    select: { id: true, openedAt: true },
  });
  if (!open) return;

  await tx.correctionCycle.update({
    where: { id: open.id },
    data: {
      status: "closed",
      closedAt: new Date(),
      closedById: params.actorUserId,
      closeReason: `Closed by approval of contribution file ${params.contributionFileId}`,
    },
  });

  await writeAudit(
    {
      organizationId: params.organizationId,
      companyId: params.companyId,
      planId: params.planId,
      actorUserId: params.actorUserId,
      action: AUDIT_ACTIONS.correctionCycleClosed,
      entityType: "correction_cycle",
      entityId: open.id,
      metadata: {
        contributionFileId: params.contributionFileId,
        durationMs: Date.now() - open.openedAt.getTime(),
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
    },
    tx,
  );
}
