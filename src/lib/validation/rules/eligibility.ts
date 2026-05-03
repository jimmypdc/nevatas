// Eligibility validators. Operate on each contribution row joined against
// the participant snapshot supplied via ValidationContext.participants.
//
// All rules require participants to be present in the context — when census
// data isn't loaded (test fixtures, partially-built contexts) the rules
// emit no issues rather than failing.

import type { IssueDraft, ParticipantSnapshot, Validator } from "@/lib/validation/types";

const AVG_DAYS_PER_MONTH = 30.4375;

function indexParticipants(participants: ParticipantSnapshot[]): Map<string, ParticipantSnapshot> {
  const out = new Map<string, ParticipantSnapshot>();
  for (const p of participants) {
    if (p.externalEmployeeId) out.set(p.externalEmployeeId, p);
  }
  return out;
}

export const terminatedWithDeferral: Validator = {
  ruleKey: "eligibility.terminated_with_deferral",
  description:
    "A participant whose termination date precedes the payroll date should not have a non-zero deferral.",
  run: ({ contributions, participants, payrollDate }) => {
    if (!participants || participants.length === 0) return [];
    const byId = indexParticipants(participants);
    const issues: IssueDraft[] = [];
    for (const c of contributions) {
      const p = byId.get(c.externalEmployeeId);
      if (!p?.dateOfTermination) continue;
      if (p.dateOfTermination >= payrollDate) continue;
      if (c.preTaxDeferral === 0 && c.rothDeferral === 0) continue;
      issues.push({
        ruleKey: "eligibility.terminated_with_deferral",
        severity: "critical",
        category: "eligibility",
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        participantId: p.id,
        message: `Participant ${c.externalEmployeeId} terminated ${p.dateOfTermination
          .toISOString()
          .slice(0, 10)} but reported a deferral on this payroll`,
        recommendedResolution:
          "Confirm the termination date in the census or correct the deferral; the payroll system may still be deducting after termination.",
        sourceField: "preTaxDeferral",
        actualValue: (c.preTaxDeferral + c.rothDeferral).toFixed(2),
      });
    }
    return issues;
  },
};

export const terminatedEmployeeInPayroll: Validator = {
  ruleKey: "eligibility.terminated_employee_in_payroll",
  description:
    "Soft signal: a terminated participant appears in this payroll run (final pay, severance, etc.) — surface for review but not blocking.",
  run: ({ contributions, participants, payrollDate }) => {
    if (!participants || participants.length === 0) return [];
    const byId = indexParticipants(participants);
    const issues: IssueDraft[] = [];
    for (const c of contributions) {
      const p = byId.get(c.externalEmployeeId);
      if (!p?.dateOfTermination) continue;
      if (p.dateOfTermination >= payrollDate) continue;
      // Already covered as critical when there's a deferral; here we only
      // flag the no-deferral case as informational.
      if (c.preTaxDeferral > 0 || c.rothDeferral > 0) continue;
      issues.push({
        ruleKey: "eligibility.terminated_employee_in_payroll",
        severity: "info",
        category: "eligibility",
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        participantId: p.id,
        message: `Participant ${c.externalEmployeeId} terminated ${p.dateOfTermination
          .toISOString()
          .slice(0, 10)} appears in this payroll (likely final pay or severance)`,
        recommendedResolution:
          "Verify the payment is appropriate (final pay, vacation payout, severance) and that no deferral should have been withheld.",
      });
    }
    return issues;
  },
};

export const contributingBeforeServiceMinimum: Validator = {
  ruleKey: "eligibility.contributing_before_service_minimum",
  description:
    "Participant deferred before satisfying the plan's minimum service requirement.",
  run: ({ contributions, participants, payrollDate, rules }) => {
    const minMonths = rules.eligibility?.minServiceMonths;
    if (!minMonths || !participants || participants.length === 0) return [];
    const byId = indexParticipants(participants);
    const issues: IssueDraft[] = [];
    for (const c of contributions) {
      if (c.preTaxDeferral === 0 && c.rothDeferral === 0) continue;
      const p = byId.get(c.externalEmployeeId);
      if (!p?.dateOfHire) continue;
      const days = (payrollDate.getTime() - p.dateOfHire.getTime()) / (24 * 3600 * 1000);
      const months = days / AVG_DAYS_PER_MONTH;
      if (months >= minMonths) continue;
      issues.push({
        ruleKey: "eligibility.contributing_before_service_minimum",
        severity: "warning",
        category: "eligibility",
        entityType: "contribution_row",
        entityId: String(c.rowIndex),
        participantId: p.id,
        message: `Participant ${c.externalEmployeeId} has ${months.toFixed(1)} months of service but plan requires ${minMonths} for elective deferrals`,
        recommendedResolution:
          "Verify the hire date in the census, or confirm the participant qualifies under a plan-specific eligibility provision (immediate eligibility for rehires, etc.).",
        sourceField: "preTaxDeferral",
        expectedValue: `>= ${minMonths} months`,
        actualValue: `${months.toFixed(1)} months`,
      });
    }
    return issues;
  },
};
