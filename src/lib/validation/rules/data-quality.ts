import type { Validator } from "@/lib/validation/types";

// Missing or duplicate employee identifiers, negative compensation, etc.

export const missingEmployeeIdentifier: Validator = {
  ruleKey: "data_quality.missing_employee_identifier",
  description: "Every contribution row must have an external employee identifier.",
  run: ({ contributions }) =>
    contributions
      .filter((c) => !c.externalEmployeeId)
      .map((c) => ({
        ruleKey: "data_quality.missing_employee_identifier",
        severity: "blocking" as const,
        category: "data_quality" as const,
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        message: "Row is missing an external employee identifier",
        recommendedResolution: "Update the source file or column mapping to include Employee ID.",
        sourceField: "externalEmployeeId",
      })),
};

export const duplicateEmployeeRow: Validator = {
  ruleKey: "data_quality.duplicate_employee_in_run",
  description: "An employee may appear at most once per payroll run.",
  run: ({ contributions }) => {
    const seen = new Map<string, number>();
    const out = [];
    for (const c of contributions) {
      if (!c.externalEmployeeId) continue;
      const prev = seen.get(c.externalEmployeeId);
      if (prev !== undefined) {
        out.push({
          ruleKey: "data_quality.duplicate_employee_in_run",
          severity: "blocking" as const,
          category: "duplicate_omission" as const,
          entityType: "contribution_row",
          entityId: String(c.rowIndex),
          message: `Employee ${c.externalEmployeeId} appears multiple times in this payroll run`,
          recommendedResolution: "Remove or consolidate duplicate rows in the source file.",
          actualValue: c.externalEmployeeId,
        });
      } else {
        seen.set(c.externalEmployeeId, c.rowIndex);
      }
    }
    return out;
  },
};

export const negativeCompensation: Validator = {
  ruleKey: "data_quality.negative_compensation",
  description: "Gross compensation must not be negative.",
  run: ({ contributions }) =>
    contributions
      .filter((c) => c.grossCompensation < 0)
      .map((c) => ({
        ruleKey: "data_quality.negative_compensation",
        severity: "blocking" as const,
        category: "compensation" as const,
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        message: "Gross compensation is negative",
        recommendedResolution: "Investigate the payroll source — negatives usually indicate void/reversal rows.",
        sourceField: "grossCompensation",
        actualValue: c.grossCompensation.toFixed(2),
      })),
};

export const zeroCompensationWithDeferral: Validator = {
  ruleKey: "data_quality.zero_comp_with_deferral",
  description: "A row cannot have $0 compensation but a non-zero deferral.",
  run: ({ contributions }) =>
    contributions
      .filter(
        (c) =>
          c.grossCompensation === 0 &&
          (c.preTaxDeferral > 0 || c.rothDeferral > 0),
      )
      .map((c) => ({
        ruleKey: "data_quality.zero_comp_with_deferral",
        severity: "critical" as const,
        category: "compensation" as const,
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        message: "Row reports a deferral but $0 compensation",
        recommendedResolution: "Verify payroll source data — deferrals require eligible compensation.",
      })),
};
