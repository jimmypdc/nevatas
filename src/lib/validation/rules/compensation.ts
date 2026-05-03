// Compensation-definition validators.
//
// Plans differ on what "compensation" means: 415 comp, W-2, §3401(a) wages,
// or "plan compensation" with various exclusions (bonus, commissions,
// fringe). The rules here don't try to reproduce every legal definition —
// instead they enforce two structural invariants:
//
//   - eligible_exceeds_gross   : structurally impossible. Always blocking.
//   - eligible_missing         : when plan rule says "eligible_required",
//                                every row must populate eligibleCompensation.
//   - eligible_ratio_drift     : eligible/gross must be at least the plan's
//                                expectedEligibleToGrossMin. Catches a
//                                payroll-side exclusion-list change that
//                                silently shrinks the comp base.

import type { IssueDraft, Validator } from "@/lib/validation/types";

export const eligibleExceedsGross: Validator = {
  ruleKey: "compensation.eligible_exceeds_gross",
  description: "Eligible compensation cannot exceed gross compensation.",
  run: ({ contributions }) =>
    contributions
      .filter(
        (c) =>
          typeof c.eligibleCompensation === "number" &&
          c.eligibleCompensation > c.grossCompensation + 0.01,
      )
      .map((c) => ({
        ruleKey: "compensation.eligible_exceeds_gross",
        severity: "blocking" as const,
        category: "compensation" as const,
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        message: `Eligible compensation $${c.eligibleCompensation!.toFixed(2)} exceeds gross $${c.grossCompensation.toFixed(2)}`,
        recommendedResolution:
          "Re-export from payroll; the eligible-comp column is likely mapped to the wrong source field.",
        sourceField: "eligibleCompensation",
        expectedValue: `<= ${c.grossCompensation.toFixed(2)}`,
        actualValue: c.eligibleCompensation!.toFixed(2),
      })),
};

export const eligibleMissingWhenRequired: Validator = {
  ruleKey: "compensation.eligible_missing_when_required",
  description:
    "Plan rule requires eligibleCompensation but the row does not provide it.",
  run: ({ contributions, rules }) => {
    if (rules.compensationDefinition?.basis !== "eligible_required") return [];
    return contributions
      .filter((c) => typeof c.eligibleCompensation !== "number")
      .map((c) => ({
        ruleKey: "compensation.eligible_missing_when_required",
        severity: "warning" as const,
        category: "compensation" as const,
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        message: `Plan uses an eligible-comp definition but row ${c.rowIndex} did not supply eligibleCompensation`,
        recommendedResolution:
          "Map the eligible-compensation column from the source file or update the plan rule version to use gross.",
        sourceField: "eligibleCompensation",
      }));
  },
};

export const eligibleRatioDrift: Validator = {
  ruleKey: "compensation.eligible_ratio_drift",
  description:
    "Eligible/gross ratio is below the plan's expected minimum — possible exclusion-list change.",
  run: ({ contributions, rules }) => {
    const min = rules.compensationDefinition?.expectedEligibleToGrossMin;
    if (!min) return [];
    return contributions
      .filter((c) => typeof c.eligibleCompensation === "number" && c.grossCompensation > 0)
      .map((c) => {
        const ratio = c.eligibleCompensation! / c.grossCompensation;
        return { c, ratio };
      })
      .filter(({ ratio }) => ratio + 0.0001 < min)
      .map(({ c, ratio }) => ({
        ruleKey: "compensation.eligible_ratio_drift",
        severity: "warning" as const,
        category: "compensation" as const,
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        message: `Eligible/gross ratio ${(ratio * 100).toFixed(1)}% is below plan minimum ${(min * 100).toFixed(1)}%`,
        recommendedResolution:
          "Verify exclusions (bonus, commission, fringe) on the payroll side haven't drifted from the plan document.",
        sourceField: "eligibleCompensation",
        expectedValue: `ratio >= ${(min * 100).toFixed(1)}%`,
        actualValue: `${(ratio * 100).toFixed(1)}%`,
      }));
  },
};
