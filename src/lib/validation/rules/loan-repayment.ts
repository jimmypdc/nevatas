// Loan-repayment validators. Cross-check the payroll-row loanRepayment
// amount against the per-participant LoanSchedule supplied via
// ValidationContext.loanSchedules.
//
// Rules:
//   - loan_repayment.no_active_schedule: row has loanRepayment > 0 but
//     no active LoanSchedule exists for that participant. Could be a stale
//     payroll deduction that should be turned off, or a schedule we haven't
//     ingested yet.
//
//   - loan_repayment.amount_mismatch: row has loanRepayment, an active
//     schedule exists, and the reported amount differs from the schedule's
//     expectedPaymentAmount by more than $0.01.
//
// Phase 1 caveat: a participant with multiple active loans gets summed
// expectedPaymentAmount, then the validator compares against the row's
// loanRepayment. If the schedules use different paymentFrequency values
// the validator ignores them — frequency-aware proration is a future
// enhancement.

import type { IssueDraft, LoanScheduleSnapshot, Validator } from "@/lib/validation/types";

function indexSchedules(schedules: LoanScheduleSnapshot[]): Map<string, LoanScheduleSnapshot[]> {
  const out = new Map<string, LoanScheduleSnapshot[]>();
  for (const s of schedules) {
    if (s.status !== "active") continue;
    const list = out.get(s.externalEmployeeId) ?? [];
    list.push(s);
    out.set(s.externalEmployeeId, list);
  }
  return out;
}

export const loanRepaymentNoActiveSchedule: Validator = {
  ruleKey: "loan_repayment.no_active_schedule",
  description:
    "Payroll row reports a loan repayment but no active loan schedule exists for the participant.",
  run: ({ contributions, loanSchedules }) => {
    if (!loanSchedules) return [];
    const byEmp = indexSchedules(loanSchedules);
    const issues: IssueDraft[] = [];
    for (const c of contributions) {
      if (c.loanRepayment <= 0) continue;
      const list = byEmp.get(c.externalEmployeeId);
      if (list && list.length > 0) continue;
      issues.push({
        ruleKey: "loan_repayment.no_active_schedule",
        severity: "warning",
        category: "loan_repayment",
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        message: `Loan repayment $${c.loanRepayment.toFixed(2)} reported for ${c.externalEmployeeId} but no active loan schedule on file`,
        recommendedResolution:
          "Confirm the loan schedule is current. If the loan was paid off, ensure the payroll deduction has been stopped.",
        sourceField: "loanRepayment",
        actualValue: c.loanRepayment.toFixed(2),
      });
    }
    return issues;
  },
};

export const loanRepaymentAmountMismatch: Validator = {
  ruleKey: "loan_repayment.amount_mismatch",
  description:
    "Reported loan repayment differs from the sum of active loan schedules' expected payment amounts.",
  run: ({ contributions, loanSchedules }) => {
    if (!loanSchedules) return [];
    const byEmp = indexSchedules(loanSchedules);
    const issues: IssueDraft[] = [];
    for (const c of contributions) {
      const list = byEmp.get(c.externalEmployeeId);
      if (!list || list.length === 0) continue;
      const expected = round2(list.reduce((s, x) => s + x.expectedPaymentAmount, 0));
      if (Math.abs(expected - c.loanRepayment) <= 0.01) continue;
      issues.push({
        ruleKey: "loan_repayment.amount_mismatch",
        severity: "warning",
        category: "loan_repayment",
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        message: `Reported loan repayment $${c.loanRepayment.toFixed(2)} differs from amortization-expected $${expected.toFixed(2)}`,
        recommendedResolution:
          "Verify the amortization schedule and the payroll deduction. Mid-loan refinances or grace periods can produce expected mismatches; document the reason.",
        sourceField: "loanRepayment",
        expectedValue: expected.toFixed(2),
        actualValue: c.loanRepayment.toFixed(2),
      });
    }
    return issues;
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
