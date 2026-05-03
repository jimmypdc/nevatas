// Census-vs-payroll cross-file validators. Operate on the SET of
// participants vs the SET of contributions (rather than per-row).
//
// Phase 1 rules:
//   - census_payroll.active_employee_missing_from_payroll
//     Active, hired-before-payroll-date participant has no contribution row
//     in this run. Common false-positive sources: unpaid leave, terminated
//     mid-period without termination date sync, separately-paid contractors
//     in the census. Surfaced at "info" severity.

import type { IssueDraft, Validator } from "@/lib/validation/types";

export const activeEmployeeMissingFromPayroll: Validator = {
  ruleKey: "census_payroll.active_employee_missing_from_payroll",
  description:
    "An active participant whose hire date precedes this payroll has no contribution row.",
  run: ({ contributions, participants, payrollDate }) => {
    if (!participants || participants.length === 0) return [];
    const inPayroll = new Set(contributions.map((c) => c.externalEmployeeId));
    const issues: IssueDraft[] = [];
    for (const p of participants) {
      if (p.status !== "active") continue;
      if (!p.externalEmployeeId) continue;
      if (inPayroll.has(p.externalEmployeeId)) continue;
      // Skip participants hired after this payroll date — they wouldn't be
      // expected to have a row.
      if (p.dateOfHire && p.dateOfHire > payrollDate) continue;
      // Skip participants with a termination date — their absence is expected.
      if (p.dateOfTermination && p.dateOfTermination <= payrollDate) continue;
      issues.push({
        ruleKey: "census_payroll.active_employee_missing_from_payroll",
        severity: "info",
        category: "eligibility",
        entityType: "participant",
        entityId: p.externalEmployeeId,
        participantId: p.id,
        message: `Active participant ${p.externalEmployeeId} (${p.firstName} ${p.lastName}) is missing from this payroll`,
        recommendedResolution:
          "Common causes: unpaid leave, off-cycle pay, mid-period termination not yet synced to census. Verify before approval.",
      });
    }
    return issues;
  },
};
