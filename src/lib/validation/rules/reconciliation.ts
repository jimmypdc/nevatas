import type { Validator } from "@/lib/validation/types";

// Header-vs-line totals reconciliation. The caller passes in the totals it
// computed from the source file (e.g. from a sum row, or from an explicit
// header total field) via ctx.totals; the engine computes the line sum from
// normalized contributions and compares.

export const totalsReconciliation: Validator = {
  ruleKey: "approval_readiness.totals_reconcile",
  description: "Header totals must equal the sum of line items.",
  run: ({ contributions, totals }) => {
    const sum = (pick: (c: (typeof contributions)[number]) => number) =>
      Math.round(contributions.reduce((s, c) => s + pick(c), 0) * 100) / 100;

    const checks: { label: string; computed: number; reported: number }[] = [
      { label: "grossCompensation", computed: sum((c) => c.grossCompensation), reported: totals.grossCompensation },
      { label: "preTaxDeferral", computed: sum((c) => c.preTaxDeferral), reported: totals.preTaxDeferral },
      { label: "rothDeferral", computed: sum((c) => c.rothDeferral), reported: totals.rothDeferral },
      { label: "employerMatch", computed: sum((c) => c.employerMatch), reported: totals.employerMatch },
      { label: "loanRepayment", computed: sum((c) => c.loanRepayment), reported: totals.loanRepayment },
    ];

    return checks
      .filter((c) => Math.abs(c.computed - c.reported) > 0.01)
      .map((c) => ({
        ruleKey: "approval_readiness.totals_reconcile",
        severity: "blocking" as const,
        category: "approval_readiness" as const,
        entityType: "payroll_run",
        message: `${c.label}: computed $${c.computed.toFixed(2)} does not equal reported $${c.reported.toFixed(2)}`,
        recommendedResolution: "Re-export from payroll or correct the source file before approval.",
        sourceField: c.label,
        expectedValue: c.reported.toFixed(2),
        actualValue: c.computed.toFixed(2),
      }));
  },
};
