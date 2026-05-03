// Validation engine types. The output is a list of ValidationIssue records,
// one per rule violation, written to the ValidationIssue table after a run.

import type { NormalizedContribution } from "@/lib/normalization/engine";

export type Severity = "info" | "warning" | "critical" | "blocking";

export type ValidationCategory =
  | "data_quality"
  | "identity_match"
  | "eligibility"
  | "contribution_limit"
  | "compensation"
  | "loan_repayment"
  | "employer_match"
  | "safe_harbor"
  | "payroll_timeliness"
  | "recordkeeper_format"
  | "duplicate_omission"
  | "approval_readiness";

export type IssueDraft = {
  ruleKey: string;
  severity: Severity;
  category: ValidationCategory;
  entityType: string;
  entityId?: string;
  participantId?: string;
  message: string;
  recommendedResolution?: string;
  sourceField?: string;
  expectedValue?: string;
  actualValue?: string;
};

// Minimal plan rules used by Phase 1 validators. Loaded from the most recent
// PlanRuleVersion effective on or before the payroll date.
export type PlanRules = {
  planYear: number;
  irsElectiveDeferralLimit: number; // 2024: $23,000; 2025: $23,500
  irsCatchUpLimit50Plus: number; // 2024/2025: $7,500
  maxEmployeeDeferralPercent?: number; // plan-level cap if any
  matchFormula?: {
    type: "tiered" | "flat";
    flatPercent?: number;
    tiers?: { upToPercent: number; matchPercent: number }[];
  };
  safeHarborType?: "basic_match" | "enhanced_match" | "nonelective_3pct" | "none";
  timeliness?: TimelinessConfig;
  // Used to validate that small-plan safe harbor is only applied to plans
  // with fewer than 100 participants on the first day of the plan year.
  participantCount?: number;
  eligibility?: EligibilityConfig;
  compensationDefinition?: CompensationDefinition;
  // Recordkeeper output template key (see lib/recordkeepers). When omitted
  // the contribution-file generator falls back to nevatas.v1.
  outputFormat?: string;
};

export type EligibilityConfig = {
  // Service requirement before a participant can defer. Phase 1 validators
  // measure from the participant's dateOfHire (rounded to 30.4375-day months).
  minServiceMonths?: number;
  // Future expansion: minAgeYears, entryDates ("immediate" | "monthly" | ...).
};

export type CompensationDefinition = {
  // "gross" — deferrals computed against grossCompensation.
  // "eligible_required" — eligibleCompensation must be populated on every
  // contribution row; the validator flags rows missing it.
  basis: "gross" | "eligible_required";
  // Optional sanity check: eligibleCompensation / grossCompensation must be
  // at least this fraction. Catches stale exclusion rules silently shrinking
  // the comp base. Set undefined to skip.
  expectedEligibleToGrossMin?: number;
};

export type TimelinessConfig = {
  // Which DOL framework the plan operates under.
  //   - small_plan_safe_harbor_7_business_days: 29 CFR §2510.3-102(a)(2),
  //     available only to plans with <100 participants. 7 business days from
  //     the date amounts would otherwise have been payable to the participant.
  //   - general_as_soon_as_feasible: 29 CFR §2510.3-102(a)(1), backstop is
  //     the 15th business day of the month following withholding, but DOL
  //     guidance is that "as soon as administratively feasible" controls.
  //   - custom: use customWarningThresholdBusinessDays / customCriticalBusinessDays
  //     directly. For plans whose service agreement defines a tighter SLA.
  rule: "small_plan_safe_harbor_7_business_days" | "general_as_soon_as_feasible" | "custom";
  // Phase 1 emits a warning at warningBusinessDays and a critical at
  // criticalBusinessDays. Defaults are derived from `rule` when these fields
  // are omitted; "custom" requires them.
  customWarningThresholdBusinessDays?: number;
  customCriticalBusinessDays?: number;
};

export type ParticipantSnapshot = {
  id: string;
  externalEmployeeId: string;
  firstName: string;
  lastName: string;
  status: string; // active | terminated | rehired
  dateOfHire: Date | null;
  dateOfTermination: Date | null;
};

export type LoanScheduleSnapshot = {
  id: string;
  participantId: string;
  externalEmployeeId: string;
  loanNumber: string;
  expectedPaymentAmount: number;
  paymentFrequency: "weekly" | "biweekly" | "semimonthly" | "monthly";
  status: string; // active | paid_off | defaulted
};

export type ValidationContext = {
  payrollRunId: string;
  payrollDate: Date;
  contributions: NormalizedContribution[];
  totals: {
    grossCompensation: number;
    preTaxDeferral: number;
    rothDeferral: number;
    employerMatch: number;
    loanRepayment: number;
  };
  rules: PlanRules;
  // Year-to-date deferral totals per externalEmployeeId, supplied by the caller
  // from prior validated payroll runs in the same plan year.
  ytdDeferralByEmployee?: Record<string, { preTax: number; roth: number }>;
  // All participants on file at run-creation time. Enables eligibility and
  // census-vs-payroll cross checks. Optional for backward compatibility with
  // tests that don't supply it.
  participants?: ParticipantSnapshot[];
  // Active loan schedules for the plan, keyed off externalEmployeeId for
  // matching against contribution rows.
  loanSchedules?: LoanScheduleSnapshot[];
};

export type Validator = {
  ruleKey: string;
  description: string;
  run: (ctx: ValidationContext) => IssueDraft[];
};
