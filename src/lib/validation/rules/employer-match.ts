import type { Validator } from "@/lib/validation/types";

// Recompute expected employer match from the plan match formula and flag
// per-row mismatches. Currently supports flat-percent and tiered formulas.
//
// "Tiered" example (basic safe harbor match):
//   100% of first 3% deferred + 50% of next 2% deferred
//   tiers: [{ upToPercent: 3, matchPercent: 100 }, { upToPercent: 5, matchPercent: 50 }]

export const matchFormulaMismatch: Validator = {
  ruleKey: "employer_match.formula_mismatch",
  description: "Reported employer match must match the plan formula within $0.01.",
  run: ({ contributions, rules }) => {
    if (!rules.matchFormula) return [];
    const formula = rules.matchFormula;
    return contributions.flatMap((c) => {
      if (c.grossCompensation <= 0) return [];
      const deferralPct = ((c.preTaxDeferral + c.rothDeferral) / c.grossCompensation) * 100;
      const expected = expectedMatch(c.grossCompensation, deferralPct, formula);
      if (Math.abs(expected - c.employerMatch) <= 0.01) return [];
      return [
        {
          ruleKey: "employer_match.formula_mismatch",
          severity: "warning" as const,
          category: "employer_match" as const,
          entityType: "contribution_row",
          entityId: String(c.rowIndex),
          message: `Reported match $${c.employerMatch.toFixed(2)} differs from plan-formula expectation $${expected.toFixed(2)}`,
          recommendedResolution:
            "Verify match calculation in payroll; mismatches may indicate true-up handling or formula drift.",
          sourceField: "employerMatch",
          expectedValue: expected.toFixed(2),
          actualValue: c.employerMatch.toFixed(2),
        },
      ];
    });
  },
};

function expectedMatch(
  gross: number,
  deferralPct: number,
  formula: NonNullable<import("@/lib/validation/types").PlanRules["matchFormula"]>,
): number {
  if (formula.type === "flat") {
    const pct = formula.flatPercent ?? 0;
    // Treat flat as: match = pct% * gross, capped at deferral amount.
    const cappedPct = Math.min(deferralPct, pct);
    return round2(gross * (cappedPct / 100));
  }
  // Tiered. Walk tiers in order; each tier contributes match on the slice of
  // deferral % within (prevTier.upToPercent, tier.upToPercent].
  let totalMatchPct = 0;
  let prevUpTo = 0;
  for (const tier of formula.tiers ?? []) {
    if (deferralPct <= prevUpTo) break;
    const sliceTop = Math.min(deferralPct, tier.upToPercent);
    const sliceWidth = Math.max(0, sliceTop - prevUpTo);
    totalMatchPct += sliceWidth * (tier.matchPercent / 100);
    prevUpTo = tier.upToPercent;
    if (deferralPct <= tier.upToPercent) break;
  }
  return round2(gross * (totalMatchPct / 100));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
