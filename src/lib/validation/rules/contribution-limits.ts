import type { Validator } from "@/lib/validation/types";

// Per-row deferral % cap and YTD IRS 402(g) elective deferral limit.

export const deferralExceedsPlanPercentCap: Validator = {
  ruleKey: "contribution_limit.deferral_exceeds_plan_percent",
  description: "Per-row deferral % must not exceed the plan's elective deferral cap.",
  run: ({ contributions, rules }) => {
    if (!rules.maxEmployeeDeferralPercent) return [];
    const cap = rules.maxEmployeeDeferralPercent;
    return contributions.flatMap((c) => {
      if (c.grossCompensation <= 0) return [];
      const total = c.preTaxDeferral + c.rothDeferral;
      const pct = (total / c.grossCompensation) * 100;
      if (pct <= cap + 0.01) return [];
      return [
        {
          ruleKey: "contribution_limit.deferral_exceeds_plan_percent",
          severity: "critical" as const,
          category: "contribution_limit" as const,
          entityType: "contribution_row",
          entityId: String(c.rowIndex),
          message: `Deferral ${pct.toFixed(2)}% exceeds plan cap of ${cap}%`,
          recommendedResolution: "Reduce deferral or update plan rule version if cap changed.",
          sourceField: "preTaxDeferral",
          expectedValue: `<= ${cap}%`,
          actualValue: `${pct.toFixed(2)}%`,
        },
      ];
    });
  },
};

export const ytdElectiveDeferralLimit: Validator = {
  ruleKey: "contribution_limit.ytd_402g_elective_deferral",
  description:
    "Year-to-date pre-tax + Roth deferrals must not exceed the IRS §402(g) limit (plus catch-up if 50+).",
  run: ({ contributions, rules, ytdDeferralByEmployee }) => {
    if (!ytdDeferralByEmployee) return [];
    return contributions.flatMap((c) => {
      const prior = ytdDeferralByEmployee[c.externalEmployeeId] ?? { preTax: 0, roth: 0 };
      const ytdTotal = prior.preTax + prior.roth + c.preTaxDeferral + c.rothDeferral;
      // Engine flags a warning at the base limit; caller can suppress with a
      // catch-up override per participant if they have a confirmed birthday.
      if (ytdTotal <= rules.irsElectiveDeferralLimit + 0.01) return [];
      const exceedsBaseAndCatchUp =
        ytdTotal > rules.irsElectiveDeferralLimit + rules.irsCatchUpLimit50Plus + 0.01;
      return [
        {
          ruleKey: "contribution_limit.ytd_402g_elective_deferral",
          severity: exceedsBaseAndCatchUp ? ("blocking" as const) : ("warning" as const),
          category: "contribution_limit" as const,
          entityType: "participant",
          entityId: c.externalEmployeeId,
          message: exceedsBaseAndCatchUp
            ? `YTD deferral $${ytdTotal.toFixed(2)} exceeds 402(g) limit + catch-up`
            : `YTD deferral $${ytdTotal.toFixed(2)} exceeds 402(g) base limit; verify catch-up eligibility`,
          recommendedResolution: exceedsBaseAndCatchUp
            ? "Stop further elective deferrals for this participant and process a corrective distribution."
            : "Confirm participant is age 50+ to allow catch-up; otherwise reduce deferral.",
          sourceField: "preTaxDeferral",
          expectedValue: `<= $${rules.irsElectiveDeferralLimit.toFixed(2)}`,
          actualValue: `$${ytdTotal.toFixed(2)}`,
        },
      ];
    });
  },
};
