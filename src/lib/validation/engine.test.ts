import { describe, expect, it, vi } from "vitest";

import { runValidators } from "@/lib/validation/engine";
import type { NormalizedContribution } from "@/lib/normalization/engine";
import type { PlanRules, ValidationContext } from "@/lib/validation/types";

const baseRules: PlanRules = {
  planYear: 2025,
  irsElectiveDeferralLimit: 23_500,
  irsCatchUpLimit50Plus: 7_500,
  maxEmployeeDeferralPercent: 100,
  matchFormula: {
    type: "tiered",
    tiers: [
      { upToPercent: 3, matchPercent: 100 },
      { upToPercent: 5, matchPercent: 50 },
    ],
  },
};

function row(over: Partial<NormalizedContribution>): NormalizedContribution {
  return {
    externalEmployeeId: "E001",
    payrollDate: new Date("2025-04-01"),
    grossCompensation: 4000,
    preTaxDeferral: 0,
    rothDeferral: 0,
    employerMatch: 0,
    loanRepayment: 0,
    raw: {},
    rowIndex: 0,
    ...over,
  };
}

function ctx(rows: NormalizedContribution[], partial: Partial<ValidationContext> = {}): ValidationContext {
  return {
    payrollRunId: "run1",
    payrollDate: new Date("2025-04-01"),
    contributions: rows,
    rules: baseRules,
    totals: {
      grossCompensation: rows.reduce((s, r) => s + r.grossCompensation, 0),
      preTaxDeferral: rows.reduce((s, r) => s + r.preTaxDeferral, 0),
      rothDeferral: rows.reduce((s, r) => s + r.rothDeferral, 0),
      employerMatch: rows.reduce((s, r) => s + r.employerMatch, 0),
      loanRepayment: rows.reduce((s, r) => s + r.loanRepayment, 0),
    },
    ...partial,
  };
}

describe("validation engine", () => {
  it("flags duplicate employees as blocking", () => {
    const result = runValidators(
      ctx([
        row({ externalEmployeeId: "E001", rowIndex: 0 }),
        row({ externalEmployeeId: "E001", rowIndex: 1 }),
      ]),
    );
    const dup = result.issues.find((i) => i.ruleKey === "data_quality.duplicate_employee_in_run");
    expect(dup?.severity).toBe("blocking");
    expect(result.hasBlocking).toBe(true);
  });

  it("flags zero compensation with non-zero deferral", () => {
    const result = runValidators(
      ctx([row({ grossCompensation: 0, preTaxDeferral: 100, rowIndex: 0 })]),
    );
    expect(
      result.issues.some((i) => i.ruleKey === "data_quality.zero_comp_with_deferral"),
    ).toBe(true);
  });

  it("flags negative gross compensation as blocking", () => {
    const result = runValidators(ctx([row({ grossCompensation: -100 })]));
    const neg = result.issues.find((i) => i.ruleKey === "data_quality.negative_compensation");
    expect(neg?.severity).toBe("blocking");
  });

  it("checks tiered match formula", () => {
    // 4% deferred on $4000 gross => 100%*3% = $120, plus 50%*1% = $20 => $140
    const result = runValidators(
      ctx([
        row({
          grossCompensation: 4000,
          preTaxDeferral: 160,
          employerMatch: 100, // wrong, should be 140
        }),
      ]),
    );
    const mm = result.issues.find((i) => i.ruleKey === "employer_match.formula_mismatch");
    expect(mm).toBeDefined();
    expect(mm?.expectedValue).toBe("140.00");
    expect(mm?.actualValue).toBe("100.00");
  });

  it("accepts a correctly-matched tiered formula", () => {
    const result = runValidators(
      ctx([
        row({
          grossCompensation: 4000,
          preTaxDeferral: 160, // 4%
          employerMatch: 140,
        }),
      ]),
    );
    const mm = result.issues.find((i) => i.ruleKey === "employer_match.formula_mismatch");
    expect(mm).toBeUndefined();
  });

  it("flags 402(g) overage as warning when only base limit exceeded, blocking when base+catchup exceeded", () => {
    const overBase = runValidators(
      ctx([row({ preTaxDeferral: 1000 })], {
        ytdDeferralByEmployee: { E001: { preTax: 23_000, roth: 0 } },
      }),
    );
    const i1 = overBase.issues.find((i) => i.ruleKey === "contribution_limit.ytd_402g_elective_deferral");
    expect(i1?.severity).toBe("warning");

    const overCatchup = runValidators(
      ctx([row({ preTaxDeferral: 1000 })], {
        ytdDeferralByEmployee: { E001: { preTax: 31_000, roth: 0 } },
      }),
    );
    const i2 = overCatchup.issues.find((i) => i.ruleKey === "contribution_limit.ytd_402g_elective_deferral");
    expect(i2?.severity).toBe("blocking");
  });

  it("flags totals reconciliation mismatch as blocking", () => {
    const result = runValidators(
      ctx([row({ grossCompensation: 4000 })], {
        totals: {
          grossCompensation: 5000, // mismatch
          preTaxDeferral: 0,
          rothDeferral: 0,
          employerMatch: 0,
          loanRepayment: 0,
        },
      }),
    );
    const mm = result.issues.find((i) => i.ruleKey === "approval_readiness.totals_reconcile");
    expect(mm?.severity).toBe("blocking");
  });

  it("does not fire timeliness when within the warning threshold", () => {
    // Hold "now" steady so the test is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00Z")); // Wednesday
    try {
      // payrollDate = same day → 0 business days elapsed
      const result = runValidators(
        ctx([row({})], {
          payrollDate: new Date("2026-04-22T00:00:00Z"),
        }),
      );
      expect(
        result.issues.find((i) => i.ruleKey === "payroll_timeliness.late_deposit_risk"),
      ).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("escalates timeliness through warning to critical against the small-plan safe harbor", () => {
    vi.useFakeTimers();
    try {
      const smallPlanRules = {
        ...baseRules,
        timeliness: { rule: "small_plan_safe_harbor_7_business_days" as const },
      };

      // 5 business days elapsed (Mon Apr 13 → Mon Apr 20). Threshold: warning>=4, critical>=7.
      vi.setSystemTime(new Date("2026-04-20T00:00:00Z"));
      const warning = runValidators(
        ctx([row({})], {
          payrollDate: new Date("2026-04-13T00:00:00Z"),
          rules: smallPlanRules,
        }),
      );
      const w = warning.issues.find((i) => i.ruleKey === "payroll_timeliness.late_deposit_risk");
      expect(w?.severity).toBe("warning");
      expect(w?.message).toContain("7 (small-plan");

      // 10 business days elapsed (Mon Apr 13 → Mon Apr 27). Beyond critical threshold of 7.
      vi.setSystemTime(new Date("2026-04-27T00:00:00Z"));
      const critical = runValidators(
        ctx([row({})], {
          payrollDate: new Date("2026-04-13T00:00:00Z"),
          rules: smallPlanRules,
        }),
      );
      const c = critical.issues.find((i) => i.ruleKey === "payroll_timeliness.late_deposit_risk");
      expect(c?.severity).toBe("critical");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the general 15-business-day backstop when no rule is configured", () => {
    vi.useFakeTimers();
    try {
      // 6 business days elapsed: above the 5-day warning, below the 15-day critical.
      vi.setSystemTime(new Date("2026-04-21T00:00:00Z"));
      const result = runValidators(
        ctx([row({})], {
          payrollDate: new Date("2026-04-13T00:00:00Z"),
          rules: { ...baseRules, timeliness: undefined },
        }),
      );
      const t = result.issues.find((i) => i.ruleKey === "payroll_timeliness.late_deposit_risk");
      expect(t?.severity).toBe("warning");
      expect(t?.message).toContain("general rule");
    } finally {
      vi.useRealTimers();
    }
  });

  it("freezes timeliness elapsed-days at the recorded fundedAt date", () => {
    vi.useFakeTimers();
    try {
      // "Now" is 60 calendar days past payroll — would otherwise produce a
      // critical late-deposit issue under the general 15-business-day rule.
      vi.setSystemTime(new Date("2026-06-12T00:00:00Z"));

      // But fundedAt is 6 business days after payroll — above warning (5)
      // but below critical (15). The validator must measure to fundedAt,
      // not to "now".
      const result = runValidators(
        ctx([row({})], {
          payrollDate: new Date("2026-04-13T00:00:00Z"),
          fundedAt: new Date("2026-04-21T00:00:00Z"),
        }),
      );
      const t = result.issues.find((i) => i.ruleKey === "payroll_timeliness.late_deposit_risk");
      expect(t?.severity).toBe("warning");
      expect(t?.message).toContain("recorded funding date (2026-04-21)");
      expect(t?.actualValue).toBe("6 business days");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears timeliness when fundedAt is within the warning window", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-06-12T00:00:00Z")); // long past payroll
      const result = runValidators(
        ctx([row({})], {
          payrollDate: new Date("2026-04-13T00:00:00Z"),
          // 2 business days from payroll → below warning (5) → no issue.
          fundedAt: new Date("2026-04-15T00:00:00Z"),
        }),
      );
      expect(
        result.issues.find((i) => i.ruleKey === "payroll_timeliness.late_deposit_risk"),
      ).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to today when fundedAt is undefined", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-22T00:00:00Z")); // 7 business days post payroll
      const result = runValidators(
        ctx([row({})], {
          payrollDate: new Date("2026-04-13T00:00:00Z"),
          // fundedAt: undefined — funding not yet recorded.
        }),
      );
      const t = result.issues.find((i) => i.ruleKey === "payroll_timeliness.late_deposit_risk");
      expect(t?.message).toContain("from payroll date to today");
      expect(t?.actualValue).toBe("7 business days");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flags small-plan safe harbor misapplied to a >=100 participant plan", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-20T00:00:00Z"));
      const result = runValidators(
        ctx([row({})], {
          payrollDate: new Date("2026-04-20T00:00:00Z"),
          rules: {
            ...baseRules,
            timeliness: { rule: "small_plan_safe_harbor_7_business_days" },
            participantCount: 250,
          },
        }),
      );
      const m = result.issues.find(
        (i) => i.ruleKey === "payroll_timeliness.small_plan_safe_harbor_misapplied",
      );
      expect(m?.severity).toBe("warning");
      expect(m?.actualValue).toBe("250");
    } finally {
      vi.useRealTimers();
    }
  });
});
