import { describe, expect, it } from "vitest";

import { runValidators } from "@/lib/validation/engine";
import type { NormalizedContribution } from "@/lib/normalization/engine";
import type {
  LoanScheduleSnapshot,
  ParticipantSnapshot,
  PlanRules,
  ValidationContext,
} from "@/lib/validation/types";

const baseRules: PlanRules = {
  planYear: 2026,
  irsElectiveDeferralLimit: 23_500,
  irsCatchUpLimit50Plus: 7_500,
  maxEmployeeDeferralPercent: 100,
};

function row(over: Partial<NormalizedContribution>): NormalizedContribution {
  return {
    externalEmployeeId: "E001",
    payrollDate: new Date("2026-04-15"),
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
    payrollDate: new Date("2026-04-15"),
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

function participant(over: Partial<ParticipantSnapshot> = {}): ParticipantSnapshot {
  return {
    id: "p001",
    externalEmployeeId: "E001",
    firstName: "Pat",
    lastName: "Sample",
    status: "active",
    dateOfHire: null,
    dateOfTermination: null,
    ...over,
  };
}

function loan(over: Partial<LoanScheduleSnapshot> = {}): LoanScheduleSnapshot {
  return {
    id: "l001",
    participantId: "p001",
    externalEmployeeId: "E001",
    loanNumber: "LN-1",
    expectedPaymentAmount: 100,
    paymentFrequency: "biweekly",
    status: "active",
    ...over,
  };
}

// ---------- Eligibility ----------

describe("eligibility validators", () => {
  it("flags terminated participant with active deferral as critical", () => {
    const result = runValidators(
      ctx([row({ preTaxDeferral: 100 })], {
        participants: [participant({ dateOfTermination: new Date("2026-04-01") })],
      }),
    );
    const i = result.issues.find((x) => x.ruleKey === "eligibility.terminated_with_deferral");
    expect(i?.severity).toBe("critical");
    expect(i?.participantId).toBe("p001");
  });

  it("does not double-flag (no terminated_employee_in_payroll info when there's a deferral)", () => {
    const result = runValidators(
      ctx([row({ preTaxDeferral: 100 })], {
        participants: [participant({ dateOfTermination: new Date("2026-04-01") })],
      }),
    );
    expect(
      result.issues.filter((x) => x.ruleKey === "eligibility.terminated_employee_in_payroll"),
    ).toEqual([]);
  });

  it("flags terminated employee in payroll without deferral as info", () => {
    const result = runValidators(
      ctx([row({ preTaxDeferral: 0 })], {
        participants: [participant({ dateOfTermination: new Date("2026-04-01") })],
      }),
    );
    const i = result.issues.find((x) => x.ruleKey === "eligibility.terminated_employee_in_payroll");
    expect(i?.severity).toBe("info");
  });

  it("flags contributing-before-service-minimum when hire date is too recent", () => {
    const recent = new Date("2026-03-15"); // 1 month before payroll
    const result = runValidators(
      ctx([row({ preTaxDeferral: 100 })], {
        participants: [participant({ dateOfHire: recent })],
        rules: { ...baseRules, eligibility: { minServiceMonths: 12 } },
      }),
    );
    expect(
      result.issues.find((x) => x.ruleKey === "eligibility.contributing_before_service_minimum")
        ?.severity,
    ).toBe("warning");
  });

  it("does not flag service-minimum when hire date satisfies it", () => {
    const longAgo = new Date("2024-01-15");
    const result = runValidators(
      ctx([row({ preTaxDeferral: 100 })], {
        participants: [participant({ dateOfHire: longAgo })],
        rules: { ...baseRules, eligibility: { minServiceMonths: 12 } },
      }),
    );
    expect(
      result.issues.find((x) => x.ruleKey === "eligibility.contributing_before_service_minimum"),
    ).toBeUndefined();
  });
});

// ---------- Loan repayment ----------

describe("loan repayment validators", () => {
  it("flags loan repayment with no active schedule", () => {
    const result = runValidators(
      ctx([row({ loanRepayment: 100 })], {
        loanSchedules: [],
      }),
    );
    expect(
      result.issues.find((x) => x.ruleKey === "loan_repayment.no_active_schedule")?.severity,
    ).toBe("warning");
  });

  it("does not flag amount-mismatch when no schedule is on file", () => {
    const result = runValidators(
      ctx([row({ loanRepayment: 100 })], { loanSchedules: [] }),
    );
    expect(
      result.issues.find((x) => x.ruleKey === "loan_repayment.amount_mismatch"),
    ).toBeUndefined();
  });

  it("flags reported amount that differs from amortization expected", () => {
    const result = runValidators(
      ctx([row({ loanRepayment: 75 })], {
        loanSchedules: [loan({ expectedPaymentAmount: 100 })],
      }),
    );
    const i = result.issues.find((x) => x.ruleKey === "loan_repayment.amount_mismatch");
    expect(i?.expectedValue).toBe("100.00");
    expect(i?.actualValue).toBe("75.00");
  });

  it("accepts a row matching the schedule within $0.01", () => {
    const result = runValidators(
      ctx([row({ loanRepayment: 100.005 })], {
        loanSchedules: [loan({ expectedPaymentAmount: 100 })],
      }),
    );
    expect(
      result.issues.find((x) => x.ruleKey === "loan_repayment.amount_mismatch"),
    ).toBeUndefined();
  });
});

// ---------- Safe harbor ----------

describe("safe harbor validators", () => {
  it("recomputes basic-match: 4% deferral on $4000 = $140 expected", () => {
    const result = runValidators(
      ctx(
        [
          row({
            grossCompensation: 4000,
            preTaxDeferral: 160, // 4%
            safeHarborMatch: 100, // wrong; should be 140
          }),
        ],
        { rules: { ...baseRules, safeHarborType: "basic_match" } },
      ),
    );
    const i = result.issues.find((x) => x.ruleKey === "safe_harbor.match_formula_mismatch");
    expect(i?.expectedValue).toBe("140.00");
    expect(i?.actualValue).toBe("100.00");
  });

  it("accepts an enhanced-match contribution at the floor", () => {
    const result = runValidators(
      ctx(
        [
          row({
            grossCompensation: 4000,
            preTaxDeferral: 160, // 4%
            safeHarborMatch: 160, // 100% on first 4%
          }),
        ],
        { rules: { ...baseRules, safeHarborType: "enhanced_match" } },
      ),
    );
    expect(
      result.issues.find((x) => x.ruleKey === "safe_harbor.match_formula_mismatch"),
    ).toBeUndefined();
  });

  it("flags 3% nonelective mismatch", () => {
    const result = runValidators(
      ctx(
        [
          row({
            grossCompensation: 4000,
            safeHarborNonelective: 100, // wrong; should be 120
          }),
        ],
        { rules: { ...baseRules, safeHarborType: "nonelective_3pct" } },
      ),
    );
    const i = result.issues.find((x) => x.ruleKey === "safe_harbor.nonelective_amount_mismatch");
    expect(i?.expectedValue).toBe("120.00");
  });
});

// ---------- Compensation ----------

describe("compensation validators", () => {
  it("flags eligible > gross as blocking", () => {
    const result = runValidators(
      ctx([row({ grossCompensation: 1000, eligibleCompensation: 1500 })]),
    );
    const i = result.issues.find((x) => x.ruleKey === "compensation.eligible_exceeds_gross");
    expect(i?.severity).toBe("blocking");
  });

  it("flags missing eligibleCompensation when plan requires it", () => {
    const result = runValidators(
      ctx([row({ grossCompensation: 1000 })], {
        rules: { ...baseRules, compensationDefinition: { basis: "eligible_required" } },
      }),
    );
    expect(
      result.issues.find((x) => x.ruleKey === "compensation.eligible_missing_when_required"),
    ).toBeDefined();
  });

  it("does not flag missing eligible when plan basis is gross", () => {
    const result = runValidators(
      ctx([row({ grossCompensation: 1000 })], {
        rules: { ...baseRules, compensationDefinition: { basis: "gross" } },
      }),
    );
    expect(
      result.issues.find((x) => x.ruleKey === "compensation.eligible_missing_when_required"),
    ).toBeUndefined();
  });

  it("flags ratio drift when eligible/gross is below the configured minimum", () => {
    const result = runValidators(
      ctx([row({ grossCompensation: 1000, eligibleCompensation: 700 })], {
        rules: {
          ...baseRules,
          compensationDefinition: { basis: "eligible_required", expectedEligibleToGrossMin: 0.9 },
        },
      }),
    );
    expect(
      result.issues.find((x) => x.ruleKey === "compensation.eligible_ratio_drift"),
    ).toBeDefined();
  });
});

// ---------- Census-vs-payroll ----------

describe("census-vs-payroll validators", () => {
  it("flags an active participant missing from the run as info", () => {
    const result = runValidators(
      ctx([row({ externalEmployeeId: "E001" })], {
        participants: [
          participant({ id: "p001", externalEmployeeId: "E001" }),
          participant({
            id: "p002",
            externalEmployeeId: "E002",
            firstName: "Sam",
            lastName: "Other",
          }),
        ],
      }),
    );
    const i = result.issues.find(
      (x) => x.ruleKey === "census_payroll.active_employee_missing_from_payroll",
    );
    expect(i?.severity).toBe("info");
    expect(i?.entityId).toBe("E002");
  });

  it("does not flag participants hired after the payroll date", () => {
    const result = runValidators(
      ctx([row({ externalEmployeeId: "E001" })], {
        participants: [
          participant({ id: "p001", externalEmployeeId: "E001" }),
          participant({
            id: "p999",
            externalEmployeeId: "E999",
            dateOfHire: new Date("2026-05-01"), // after payrollDate 2026-04-15
          }),
        ],
      }),
    );
    expect(
      result.issues.find((x) => x.ruleKey === "census_payroll.active_employee_missing_from_payroll"),
    ).toBeUndefined();
  });

  it("does not flag terminated participants as missing", () => {
    const result = runValidators(
      ctx([row({ externalEmployeeId: "E001" })], {
        participants: [
          participant({ id: "p001", externalEmployeeId: "E001" }),
          participant({
            id: "p888",
            externalEmployeeId: "E888",
            dateOfTermination: new Date("2026-03-01"),
            status: "terminated",
          }),
        ],
      }),
    );
    expect(
      result.issues.find(
        (x) =>
          x.ruleKey === "census_payroll.active_employee_missing_from_payroll" &&
          x.entityId === "E888",
      ),
    ).toBeUndefined();
  });
});
