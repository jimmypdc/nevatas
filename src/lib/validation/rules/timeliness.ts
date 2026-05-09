// Late-deposit risk per DOL "as soon as administratively possible" rule.
// Nevatas does not make legal determinations; we surface elapsed business
// days against the configured plan threshold and let the operator decide.
//
// Three rules are supported via PlanRules.timeliness.rule:
//   - small_plan_safe_harbor_7_business_days  (29 CFR §2510.3-102(a)(2))
//   - general_as_soon_as_feasible             (29 CFR §2510.3-102(a)(1))
//   - custom                                  (per service agreement)
//
// Elapsed-days reference: payrollDate → fundedAt when an operator has
// recorded that contributions reached the plan trust; otherwise → today.
// Once funding is recorded the elapsed-days result is frozen at the actual
// funding date — re-validations after funding produce a stable verdict
// instead of monotonically growing past the threshold.

import { businessDaysBetween } from "@/lib/validation/business-days";
import type { PlanRules, TimelinessConfig, Validator } from "@/lib/validation/types";

const DEFAULT_TIMELINESS: TimelinessConfig = {
  rule: "general_as_soon_as_feasible",
};

const RULE_THRESHOLDS: Record<
  TimelinessConfig["rule"],
  { warningBusinessDays: number; criticalBusinessDays: number; label: string }
> = {
  small_plan_safe_harbor_7_business_days: {
    warningBusinessDays: 4,
    criticalBusinessDays: 7,
    label: "small-plan 7-business-day safe harbor",
  },
  general_as_soon_as_feasible: {
    warningBusinessDays: 5,
    criticalBusinessDays: 15,
    label: "general rule (as-soon-as-administratively-feasible; 15-business-day backstop)",
  },
  custom: { warningBusinessDays: 0, criticalBusinessDays: 0, label: "custom service-agreement threshold" },
};

function effectiveTimeliness(rules: PlanRules): {
  warningBusinessDays: number;
  criticalBusinessDays: number;
  label: string;
  rule: TimelinessConfig["rule"];
  smallPlanMisapplied: boolean;
} {
  const cfg = rules.timeliness ?? DEFAULT_TIMELINESS;
  let warningBusinessDays: number;
  let criticalBusinessDays: number;
  let label: string;

  if (cfg.rule === "custom") {
    warningBusinessDays =
      cfg.customWarningThresholdBusinessDays ?? RULE_THRESHOLDS.general_as_soon_as_feasible.warningBusinessDays;
    criticalBusinessDays =
      cfg.customCriticalBusinessDays ?? RULE_THRESHOLDS.general_as_soon_as_feasible.criticalBusinessDays;
    label = RULE_THRESHOLDS.custom.label;
  } else {
    const t = RULE_THRESHOLDS[cfg.rule];
    warningBusinessDays = t.warningBusinessDays;
    criticalBusinessDays = t.criticalBusinessDays;
    label = t.label;
  }

  // The small-plan safe harbor is available only to plans with <100
  // participants on the first day of the plan year. If someone configures
  // it for a 100+ participant plan, surface that as part of the issue.
  const smallPlanMisapplied =
    cfg.rule === "small_plan_safe_harbor_7_business_days" &&
    typeof rules.participantCount === "number" &&
    rules.participantCount >= 100;

  return {
    warningBusinessDays,
    criticalBusinessDays,
    label,
    rule: cfg.rule,
    smallPlanMisapplied,
  };
}

export const lateDepositRisk: Validator = {
  ruleKey: "payroll_timeliness.late_deposit_risk",
  description: "Flags payroll runs that are aging without recorded funding.",
  run: ({ payrollDate, rules, fundedAt }) => {
    const t = effectiveTimeliness(rules);
    // When funding has been recorded, the elapsed-days result is frozen at
    // the actual funding date. Otherwise the run is still in flight; measure
    // to "now" so the issue surfaces (and re-surfaces with higher elapsed
    // counts) until the operator records funding.
    const reference = fundedAt ?? new Date();
    const elapsed = businessDaysBetween(payrollDate, reference);
    const issues = [];

    if (elapsed >= t.warningBusinessDays) {
      const isCritical = elapsed >= t.criticalBusinessDays;
      const referenceLabel = fundedAt
        ? `recorded funding date (${fundedAt.toISOString().slice(0, 10)})`
        : "today";
      issues.push({
        ruleKey: "payroll_timeliness.late_deposit_risk",
        severity: isCritical ? ("critical" as const) : ("warning" as const),
        category: "payroll_timeliness" as const,
        entityType: "payroll_run",
        message: `${elapsed} business day${elapsed === 1 ? "" : "s"} from payroll date to ${referenceLabel}; threshold is ${t.criticalBusinessDays} (${t.label})`,
        recommendedResolution: isCritical
          ? "Approve and submit the contribution file immediately and document the cause of any delay."
          : "Approve and submit the contribution file as soon as administratively feasible.",
        expectedValue: `<= ${t.criticalBusinessDays} business days`,
        actualValue: `${elapsed} business days`,
      });
    }

    if (t.smallPlanMisapplied) {
      issues.push({
        ruleKey: "payroll_timeliness.small_plan_safe_harbor_misapplied",
        severity: "warning" as const,
        category: "payroll_timeliness" as const,
        entityType: "plan_rule",
        message:
          "Plan is configured under the small-plan 7-business-day safe harbor but participantCount >= 100; safe harbor is unavailable.",
        recommendedResolution:
          "Update the plan rule version to use general_as_soon_as_feasible (or document the basis for safe-harbor eligibility).",
        actualValue: String(rules.participantCount),
        expectedValue: "< 100",
      });
    }

    return issues;
  },
};