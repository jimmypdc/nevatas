// Service: record the date contributions actually landed in the plan trust
// account. The timeliness validator measures payrollDate -> fundedAt when
// available, freezing the elapsed-days result at the actual deposit date
// instead of growing past the threshold as the run ages.
//
// Recording funding also re-runs the timeliness validator with the new
// reference date and auto-resolves any open `payroll_timeliness.late_deposit_risk`
// issue when the new verdict no longer fires. If the run was late even at
// funding, the issue stays open — fundedAt is evidence, not absolution.

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";
import { lateDepositRisk } from "@/lib/validation/rules/timeliness";
import type { PlanRules, ValidationContext } from "@/lib/validation/types";

export type RecordFundingInput = {
  organizationId: string;
  companyId: string;
  actorUserId: string;
  contributionFileId: string;
  fundedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type RecordFundingResult = {
  contributionFileId: string;
  payrollRunId: string;
  fundedAt: Date;
  // True when re-evaluating the timeliness rule against fundedAt no longer
  // produces a late_deposit_risk issue and the previously-open issue (if any)
  // was auto-resolved as a result.
  autoResolvedLateDepositIssue: boolean;
  // True when fundedAt is being recorded for the first time. False when
  // overwriting a prior funding date (the audit event distinguishes).
  firstRecord: boolean;
};

export async function recordFunding(
  input: RecordFundingInput,
): Promise<RecordFundingResult> {
  if (!Number.isFinite(input.fundedAt.getTime())) {
    throw validationError("fundedAt is not a valid date");
  }
  if (input.fundedAt.getTime() > Date.now() + 60_000) {
    // Allow a one-minute slack for clock drift between operator's machine
    // and server; otherwise refuse future-dated funding.
    throw validationError("fundedAt cannot be in the future");
  }

  const file = await db.contributionFile.findUnique({
    where: { id: input.contributionFileId },
    include: {
      payrollRun: {
        include: {
          plan: {
            select: {
              companyId: true,
              ruleVersions: {
                select: { effectiveDate: true, rulesJson: true },
                orderBy: { effectiveDate: "desc" },
                take: 5,
              },
            },
          },
        },
      },
    },
  });
  if (!file || file.payrollRun.plan.companyId !== input.companyId) {
    throw notFound("Contribution file");
  }
  if (input.fundedAt.getTime() < file.payrollRun.payrollDate.getTime()) {
    throw validationError("fundedAt cannot be earlier than the payroll date");
  }
  // A file that was never sponsor-approved shouldn't be marked as funded —
  // that would produce a paper trail asserting money moved against an
  // unauthorized document. Files in "generated" state with an approvedAt
  // timestamp are acceptable because in the demo / current build the
  // submit/accept lifecycle isn't yet UI-wired; sponsor approval is the
  // strongest authorization signal available.
  if (file.status === "draft") {
    throw blockedByPolicy(
      "Cannot record funding on a draft contribution file",
      { currentStatus: file.status },
    );
  }
  if (file.status === "generated" && !file.approvedAt) {
    throw blockedByPolicy(
      "Cannot record funding on a contribution file that has not been sponsor-approved",
      { currentStatus: file.status },
    );
  }
  if (file.status === "rejected") {
    throw blockedByPolicy("Cannot record funding on a rejected contribution file");
  }

  const planRules = pickEffectiveRules(file.payrollRun.plan.ruleVersions, file.payrollRun.payrollDate);
  if (!planRules) {
    throw validationError("Plan has no rule version effective for the run's payroll date");
  }

  const previousFundedAt = file.fundedAt;
  const firstRecord = previousFundedAt === null;

  const result = await db.$transaction(async (tx) => {
    const updated = await tx.contributionFile.update({
      where: { id: file.id },
      data: { fundedAt: input.fundedAt, fundedById: input.actorUserId },
    });

    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.contributionFileFundingRecorded,
        entityType: "contribution_file",
        entityId: file.id,
        before: previousFundedAt ? { fundedAt: previousFundedAt.toISOString() } : null,
        after: { fundedAt: input.fundedAt.toISOString() },
        metadata: {
          payrollRunId: file.payrollRunId,
          payrollDate: file.payrollRun.payrollDate.toISOString().slice(0, 10),
          version: file.version,
          firstRecord,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    // Re-evaluate the timeliness rule with the new reference. If it no
    // longer fires, auto-resolve any open late_deposit_risk issue with an
    // attribution note. The issue's history (resolutionNote) preserves the
    // chain: created at validation time, resolved at funding time.
    const ctx: ValidationContext = {
      payrollRunId: file.payrollRunId,
      payrollDate: file.payrollRun.payrollDate,
      contributions: [],
      totals: { grossCompensation: 0, preTaxDeferral: 0, rothDeferral: 0, employerMatch: 0, loanRepayment: 0 },
      rules: planRules,
      fundedAt: input.fundedAt,
    };
    const reissued = lateDepositRisk.run(ctx);
    const stillLate = reissued.some((i) => i.ruleKey === "payroll_timeliness.late_deposit_risk");

    let autoResolvedLateDepositIssue = false;
    if (!stillLate) {
      const openLateIssues = await tx.validationIssue.findMany({
        where: {
          payrollRunId: file.payrollRunId,
          ruleKey: "payroll_timeliness.late_deposit_risk",
          status: "open",
        },
        select: { id: true },
      });
      if (openLateIssues.length > 0) {
        const note = `Auto-resolved by recorded funding date ${input.fundedAt.toISOString().slice(0, 10)} (within plan threshold).`;
        await tx.validationIssue.updateMany({
          where: { id: { in: openLateIssues.map((i) => i.id) } },
          data: {
            status: "resolved",
            resolvedAt: new Date(),
            resolvedById: input.actorUserId,
            resolutionNote: note,
          },
        });
        for (const issue of openLateIssues) {
          await writeAudit(
            {
              organizationId: input.organizationId,
              companyId: input.companyId,
              actorUserId: input.actorUserId,
              action: AUDIT_ACTIONS.validationIssueAutoResolvedByFunding,
              entityType: "validation_issue",
              entityId: issue.id,
              metadata: {
                payrollRunId: file.payrollRunId,
                contributionFileId: file.id,
                fundedAt: input.fundedAt.toISOString(),
              },
              requestId: input.requestId,
            },
            tx,
          );
        }
        autoResolvedLateDepositIssue = true;
      }
    }

    return {
      contributionFileId: updated.id,
      payrollRunId: updated.payrollRunId,
      fundedAt: updated.fundedAt!,
      autoResolvedLateDepositIssue,
      firstRecord,
    };
  });

  return result;
}

function pickEffectiveRules(
  versions: { effectiveDate: Date; rulesJson: unknown }[],
  payrollDate: Date,
): PlanRules | null {
  const eligible = versions
    .filter((v) => v.effectiveDate.getTime() <= payrollDate.getTime())
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());
  return eligible.length > 0 ? (eligible[0]!.rulesJson as PlanRules) : null;
}
