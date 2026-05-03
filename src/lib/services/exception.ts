// Service: resolve, acknowledge, or waive a validation issue. Status changes
// always audit. Resolving a blocking issue may unblock the run for approval.

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notFound, validationError } from "@/lib/errors";
import { invalidateApprovalIfActive } from "@/lib/services/approval-invalidation";

export type ResolveExceptionInput = {
  organizationId: string;
  companyId: string;
  actorUserId: string;
  exceptionId: string;
  newStatus: "resolved" | "acknowledged" | "waived";
  resolutionNote?: string;
  waiverReason?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function resolveException(input: ResolveExceptionInput) {
  const issue = await db.validationIssue.findUnique({
    where: { id: input.exceptionId },
    include: { payrollRun: { include: { plan: { include: { company: true } } } } },
  });
  if (!issue) throw notFound("Exception");
  if (issue.payrollRun.plan.companyId !== input.companyId) throw notFound("Exception");

  if (input.newStatus === "waived" && !input.waiverReason) {
    throw validationError("waiverReason is required when waiving an exception");
  }

  const before = {
    status: issue.status,
    resolutionNote: issue.resolutionNote,
    waiverReason: issue.waiverReason,
  };

  const updated = await db.$transaction(async (tx) => {
    const u = await tx.validationIssue.update({
      where: { id: issue.id },
      data: {
        status: input.newStatus,
        resolutionNote: input.resolutionNote ?? issue.resolutionNote,
        waiverReason: input.newStatus === "waived" ? input.waiverReason : issue.waiverReason,
        resolvedById: input.actorUserId,
        resolvedAt: new Date(),
      },
    });

    // Resolving / waiving an exception after sponsor approval changes the
    // operative state of the run (it may have been the sole blocking issue);
    // invalidate the approval and force a re-certification.
    await invalidateApprovalIfActive(tx, {
      organizationId: input.organizationId,
      companyId: input.companyId,
      planId: issue.payrollRun.planId,
      actorUserId: input.actorUserId,
      payrollRunId: issue.payrollRunId,
      reason: `Exception ${issue.id} status changed to ${input.newStatus} after prior approval`,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });

    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: input.companyId,
        planId: issue.payrollRun.planId,
        actorUserId: input.actorUserId,
        action:
          input.newStatus === "waived"
            ? AUDIT_ACTIONS.exceptionWaived
            : AUDIT_ACTIONS.exceptionResolved,
        entityType: "validation_issue",
        entityId: issue.id,
        before,
        after: {
          status: u.status,
          resolutionNote: u.resolutionNote,
          waiverReason: u.waiverReason,
        },
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
