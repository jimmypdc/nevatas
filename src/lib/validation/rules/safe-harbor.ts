// Safe-harbor formula validators. Operate on the safeHarborMatch /
// safeHarborNonelective columns separately from the regular employer-match
// validator (which checks the matchFormula vs. the employerMatch column).
//
// Formulas implemented:
//   - basic_match     : 100% of first 3% deferred + 50% of next 2% (max 4%
//                       on 5% deferral). 26 USC §401(k)(12)(B)(i).
//   - enhanced_match  : 100% of first 4% deferred (4% match cap on 4%+
//                       deferral). The "enhanced" alternative under
//                       §401(k)(12)(B)(ii) — must be at least as generous as
//                       basic. We validate the floor; plans more generous
//                       than the floor will not flag (overpaying isn't a
//                       compliance error).
//   - nonelective_3pct: 3% of (eligible compensation when configured, else
//                       gross) regardless of deferral. §401(k)(12)(C).

import type { IssueDraft, PlanRules, Validator } from "@/lib/validation/types";

function compBase(c: { grossCompensation: number; eligibleCompensation?: number }, rules: PlanRules): number {
  if (rules.compensationDefinition?.basis === "eligible_required" && typeof c.eligibleCompensation === "number") {
    return c.eligibleCompensation;
  }
  return c.grossCompensation;
}

function basicMatchExpected(deferralPct: number, base: number): number {
  // 100% on first 3, 50% on next 2.
  const first = Math.min(3, deferralPct);
  const second = Math.max(0, Math.min(2, deferralPct - 3));
  const matchPct = first * 1 + second * 0.5;
  return round2(base * (matchPct / 100));
}

function enhancedMatchFloor(deferralPct: number, base: number): number {
  const matched = Math.min(4, deferralPct);
  return round2(base * (matched / 100));
}

export const safeHarborMatchFormulaMismatch: Validator = {
  ruleKey: "safe_harbor.match_formula_mismatch",
  description:
    "Reported safeHarborMatch does not match the configured safe-harbor formula (basic / enhanced).",
  run: ({ contributions, rules }) => {
    if (rules.safeHarborType !== "basic_match" && rules.safeHarborType !== "enhanced_match") {
      return [];
    }
    const issues: IssueDraft[] = [];
    for (const c of contributions) {
      if (c.grossCompensation <= 0) continue;
      const reported = c.safeHarborMatch ?? 0;
      const base = compBase(c, rules);
      if (base <= 0) continue;
      const deferralPct = ((c.preTaxDeferral + c.rothDeferral) / base) * 100;

      if (rules.safeHarborType === "basic_match") {
        const expected = basicMatchExpected(deferralPct, base);
        if (Math.abs(expected - reported) <= 0.01) continue;
        issues.push(makeIssue(c.rowIndex, "basic", reported, expected));
        continue;
      }
      // enhanced: reported must be at least the floor; over-match is fine.
      const floor = enhancedMatchFloor(deferralPct, base);
      if (reported + 0.01 >= floor) continue;
      issues.push(makeIssue(c.rowIndex, "enhanced", reported, floor));
    }
    return issues;
  },
};

function makeIssue(rowIndex: number, kind: "basic" | "enhanced", reported: number, expected: number): IssueDraft {
  return {
    ruleKey: "safe_harbor.match_formula_mismatch",
    severity: "warning",
    category: "safe_harbor",
    entityType: "contribution_row",
    entityId: String(rowIndex),
    message:
      kind === "basic"
        ? `Reported safe-harbor match $${reported.toFixed(2)} differs from basic-formula expectation $${expected.toFixed(2)}`
        : `Reported safe-harbor match $${reported.toFixed(2)} is below the enhanced-formula floor $${expected.toFixed(2)}`,
    recommendedResolution:
      "Verify the deferral percentage and the configured safe-harbor formula. True-up cycles can produce expected mid-year mismatches.",
    sourceField: "safeHarborMatch",
    expectedValue: kind === "basic" ? expected.toFixed(2) : `>= ${expected.toFixed(2)}`,
    actualValue: reported.toFixed(2),
  };
}

export const safeHarborNonelectiveAmountMismatch: Validator = {
  ruleKey: "safe_harbor.nonelective_amount_mismatch",
  description:
    "Reported safeHarborNonelective does not match 3% of the plan's compensation base.",
  run: ({ contributions, rules }) => {
    if (rules.safeHarborType !== "nonelective_3pct") return [];
    const issues: IssueDraft[] = [];
    for (const c of contributions) {
      const base = compBase(c, rules);
      if (base <= 0) continue;
      const reported = c.safeHarborNonelective ?? 0;
      const expected = round2(base * 0.03);
      if (Math.abs(expected - reported) <= 0.01) continue;
      issues.push({
        ruleKey: "safe_harbor.nonelective_amount_mismatch",
        severity: "warning",
        category: "safe_harbor",
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        message: `Reported safe-harbor nonelective $${reported.toFixed(2)} differs from 3% expectation $${expected.toFixed(2)}`,
        recommendedResolution:
          "Verify the compensation base used and confirm the 3% nonelective is funded each pay period rather than annually.",
        sourceField: "safeHarborNonelective",
        expectedValue: expected.toFixed(2),
        actualValue: reported.toFixed(2),
      });
    }
    return issues;
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
