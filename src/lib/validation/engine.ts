// Validation engine. Runs the registered validators over a normalized payroll
// run and returns a flat list of issues. Persistence to ValidationIssue is the
// caller's job — the engine itself is a pure function for testability.

import {
  duplicateEmployeeRow,
  missingEmployeeIdentifier,
  negativeCompensation,
  zeroCompensationWithDeferral,
} from "@/lib/validation/rules/data-quality";
import {
  deferralExceedsPlanPercentCap,
  ytdElectiveDeferralLimit,
} from "@/lib/validation/rules/contribution-limits";
import { matchFormulaMismatch } from "@/lib/validation/rules/employer-match";
import { totalsReconciliation } from "@/lib/validation/rules/reconciliation";
import { lateDepositRisk } from "@/lib/validation/rules/timeliness";
import {
  contributingBeforeServiceMinimum,
  terminatedEmployeeInPayroll,
  terminatedWithDeferral,
} from "@/lib/validation/rules/eligibility";
import {
  loanRepaymentAmountMismatch,
  loanRepaymentNoActiveSchedule,
} from "@/lib/validation/rules/loan-repayment";
import {
  safeHarborMatchFormulaMismatch,
  safeHarborNonelectiveAmountMismatch,
} from "@/lib/validation/rules/safe-harbor";
import {
  eligibleExceedsGross,
  eligibleMissingWhenRequired,
  eligibleRatioDrift,
} from "@/lib/validation/rules/compensation";
import { activeEmployeeMissingFromPayroll } from "@/lib/validation/rules/census-payroll";
import type { IssueDraft, ValidationContext, Validator } from "@/lib/validation/types";

export const VALIDATORS: Validator[] = [
  missingEmployeeIdentifier,
  duplicateEmployeeRow,
  negativeCompensation,
  zeroCompensationWithDeferral,
  deferralExceedsPlanPercentCap,
  ytdElectiveDeferralLimit,
  matchFormulaMismatch,
  totalsReconciliation,
  lateDepositRisk,
  // Eligibility
  terminatedWithDeferral,
  terminatedEmployeeInPayroll,
  contributingBeforeServiceMinimum,
  // Loans
  loanRepaymentNoActiveSchedule,
  loanRepaymentAmountMismatch,
  // Safe harbor
  safeHarborMatchFormulaMismatch,
  safeHarborNonelectiveAmountMismatch,
  // Compensation
  eligibleExceedsGross,
  eligibleMissingWhenRequired,
  eligibleRatioDrift,
  // Census-vs-payroll
  activeEmployeeMissingFromPayroll,
];

export type ValidationRunResult = {
  issues: IssueDraft[];
  countsBySeverity: Record<string, number>;
  hasBlocking: boolean;
};

export function runValidators(ctx: ValidationContext): ValidationRunResult {
  const issues: IssueDraft[] = [];
  for (const v of VALIDATORS) {
    try {
      issues.push(...v.run(ctx));
    } catch (err) {
      // A validator throwing is itself a critical issue. Don't let one bad
      // rule destroy the whole run.
      issues.push({
        ruleKey: `engine.validator_failure.${v.ruleKey}`,
        severity: "critical",
        category: "data_quality",
        entityType: "payroll_run",
        message: `Validator ${v.ruleKey} threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const countsBySeverity: Record<string, number> = {};
  for (const i of issues) {
    countsBySeverity[i.severity] = (countsBySeverity[i.severity] ?? 0) + 1;
  }

  return {
    issues,
    countsBySeverity,
    hasBlocking: issues.some((i) => i.severity === "blocking"),
  };
}
