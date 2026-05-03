// Service: record sponsor approval. Captures totals snapshot, file checksum,
// IP/UA, certification text. After approval, the run is locked. If contribution
// data changes after approval (e.g., a new contribution file is generated),
// the approval is automatically invalidated.

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { hashSnapshot } from "@/lib/crypto/hashing";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";
import { closeCorrectionCycleOnApproval } from "@/lib/services/correction-cycle";

export const SPONSOR_CERTIFICATION_TEXT =
  "I certify that I have reviewed the payroll contribution data, exception report, and contribution totals for this payroll cycle and approve the generation or submission of the contribution file.";

export type RecordApprovalInput = {
  organizationId: string;
  companyId: string;
  actorUserId: string;
  payrollRunId: string;
  contributionFileId?: string;
  acknowledgement: boolean;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function recordSponsorApproval(input: RecordApprovalInput) {
  if (!input.acknowledgement) {
    throw validationError("Approval requires the certification acknowledgement");
  }

  const run = await db.payrollRun.findUnique({
    where: { id: input.payrollRunId },
    include: {
      plan: true,
      contributions: true,
      validationIssues: true,
      contributionFiles: { orderBy: { version: "desc" } },
    },
  });
  if (!run) throw notFound("Payroll run");
  if (run.plan.companyId !== input.companyId) throw notFound("Payroll run");

  const openBlocking = run.validationIssues.filter(
    (i) => i.severity === "blocking" && i.status === "open",
  );
  if (openBlocking.length > 0) {
    throw blockedByPolicy(
      "Cannot approve while blocking exceptions remain open",
      { openBlockingCount: openBlocking.length },
    );
  }

  let contributionFile = null;
  if (input.contributionFileId) {
    contributionFile = run.contributionFiles.find((f) => f.id === input.contributionFileId) ?? null;
    if (!contributionFile) throw notFound("Contribution file");
  } else {
    contributionFile = run.contributionFiles[0] ?? null;
  }

  const totalsSnapshot = {
    grossCompensation: run.totalGrossComp?.toString() ?? "0",
    totalContributions: run.totalContributions?.toString() ?? "0",
    contributionCount: run.contributions.length,
    rowSnapshotHash: hashSnapshot(
      run.contributions
        .map((c) => ({
          ext: c.externalEmployeeId,
          gross: c.grossCompensation.toString(),
          pre: c.preTaxDeferral.toString(),
          roth: c.rothDeferral.toString(),
          match: c.employerMatch.toString(),
          loan: c.loanRepayment.toString(),
        }))
        .sort((a, b) => (a.ext ?? "").localeCompare(b.ext ?? "")),
    ),
  };
  const exceptionsAcknowledged = run.validationIssues.map((i) => ({
    id: i.id,
    ruleKey: i.ruleKey,
    severity: i.severity,
    status: i.status,
    waiverReason: i.waiverReason,
  }));

  const approval = await db.$transaction(async (tx) => {
    const now = new Date();

    const ar = await tx.approvalRecord.create({
      data: {
        payrollRunId: run.id,
        contributionFileId: contributionFile?.id ?? null,
        approvedById: input.actorUserId,
        certificationText: SPONSOR_CERTIFICATION_TEXT,
        totalsSnapshotJson: totalsSnapshot,
        exceptionsAcknowledgedJson: exceptionsAcknowledged,
        fileChecksum: contributionFile?.checksum ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });

    await tx.payrollRun.update({
      where: { id: run.id },
      data: {
        status: "approved",
        approvedAt: now,
        approvedById: input.actorUserId,
        approvalInvalidatedAt: null,
      },
    });

    if (contributionFile) {
      await tx.contributionFile.update({
        where: { id: contributionFile.id },
        data: { approvedById: input.actorUserId, approvedAt: now },
      });

      // If a correction cycle was open, this approval closes it. The cycle
      // service handles the audit event; if no cycle is open it's a no-op.
      await closeCorrectionCycleOnApproval(tx, {
        organizationId: input.organizationId,
        companyId: input.companyId,
        planId: run.planId,
        actorUserId: input.actorUserId,
        payrollRunId: run.id,
        contributionFileId: contributionFile.id,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      });
    }

    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: input.companyId,
        planId: run.planId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.sponsorApprovalRecorded,
        entityType: "payroll_run",
        entityId: run.id,
        after: {
          approvalRecordId: ar.id,
          contributionFileId: contributionFile?.id,
          totalsSnapshot,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return ar;
  });

  return approval;
}
