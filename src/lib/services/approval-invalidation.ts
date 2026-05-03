// Approval invalidation. Per CLAUDE.md §8.7: "If contribution data changes
// after approval, approval is invalidated and a new approval is required."
// This module centralizes that behavior so every code path that mutates a
// post-approval payroll run takes the same action.

import type { Prisma } from "@prisma/client";

import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";

export type InvalidateApprovalInput = {
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

// Invalidates the current approval on a payroll run if one exists. Safe to
// call when no approval is in force — it's a no-op in that case.
//
// Must be called inside the same transaction as the mutation that triggered
// the invalidation, so the audit chain stays consistent.
export async function invalidateApprovalIfActive(
  tx: Prisma.TransactionClient,
  input: InvalidateApprovalInput,
): Promise<{ invalidated: boolean; approvalRecordIds: string[] }> {
  const run = await tx.payrollRun.findUnique({
    where: { id: input.payrollRunId },
    select: {
      id: true,
      approvedAt: true,
      approvalInvalidatedAt: true,
      status: true,
    },
  });
  if (!run || !run.approvedAt || run.approvalInvalidatedAt) {
    return { invalidated: false, approvalRecordIds: [] };
  }

  const now = new Date();

  // Mark the run as no longer approved. Status moves back to exception_review
  // so the operator must re-validate, re-generate (if needed), and re-approve.
  await tx.payrollRun.update({
    where: { id: run.id },
    data: {
      approvalInvalidatedAt: now,
      status: "exception_review",
    },
  });

  // Invalidate any approval records that have not yet been invalidated.
  const activeApprovals = await tx.approvalRecord.findMany({
    where: { payrollRunId: run.id, invalidatedAt: null },
    select: { id: true },
  });
  for (const a of activeApprovals) {
    await tx.approvalRecord.update({
      where: { id: a.id },
      data: { invalidatedAt: now, invalidationReason: input.reason },
    });
  }

  await writeAudit(
    {
      organizationId: input.organizationId,
      companyId: input.companyId,
      planId: input.planId,
      actorUserId: input.actorUserId,
      action: AUDIT_ACTIONS.approvalInvalidated,
      entityType: "payroll_run",
      entityId: run.id,
      metadata: {
        reason: input.reason,
        invalidatedApprovalIds: activeApprovals.map((a) => a.id),
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    },
    tx,
  );

  return { invalidated: true, approvalRecordIds: activeApprovals.map((a) => a.id) };
}
