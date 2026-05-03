// Deterministic mock data for the Paycor mock adapter. Same connection id
// produces the same employees + payroll runs every time, so tests are
// reproducible and a "Connect Paycor (mock)" demo always shows the same
// thing. Real Paycor adapter (live-adapter.ts) replaces this with HTTP
// calls to the sandbox / production API.

import type {
  ProviderCompany,
  ProviderContribution,
  ProviderEmployee,
  ProviderPayrollRun,
  ProviderPayrollRunDetail,
} from "@/lib/integrations/types";

export const MOCK_COMPANY: ProviderCompany = {
  externalCompanyId: "PAY-MOCK-CO-001",
  legalName: "Acme Industries Inc. (Paycor mock)",
  ein: "12-3456789",
  recordkeeper: "Empower",
};

// Eight participants spanning eligibility states the validators care about:
//   - long-tenured, deferring (E001, E002)
//   - newly hired, before service minimum (E003, E004)
//   - hired post-payroll-date (E005)
//   - terminated mid-year (E006)
//   - rehired (E007)
//   - on leave (E008)
export const MOCK_EMPLOYEES: ProviderEmployee[] = [
  {
    externalEmployeeId: "PE0001",
    firstName: "Alex",
    lastName: "Morgan",
    ssn: "111223333",
    dateOfBirth: new Date(Date.UTC(1985, 4, 12)),
    dateOfHire: new Date(Date.UTC(2018, 2, 15)),
    status: "active",
    email: "alex.morgan@acme.example",
  },
  {
    externalEmployeeId: "PE0002",
    firstName: "Brooke",
    lastName: "Chen",
    ssn: "222334444",
    dateOfBirth: new Date(Date.UTC(1990, 7, 3)),
    dateOfHire: new Date(Date.UTC(2020, 0, 6)),
    status: "active",
    email: "brooke.chen@acme.example",
  },
  {
    externalEmployeeId: "PE0003",
    firstName: "Casey",
    lastName: "Diaz",
    ssn: "333445555",
    dateOfBirth: new Date(Date.UTC(1995, 11, 22)),
    dateOfHire: new Date(Date.UTC(2026, 0, 10)),
    status: "active",
    email: "casey.diaz@acme.example",
  },
  {
    externalEmployeeId: "PE0004",
    firstName: "Drew",
    lastName: "Thompson",
    ssn: "444556666",
    dateOfBirth: new Date(Date.UTC(1992, 5, 30)),
    dateOfHire: new Date(Date.UTC(2025, 9, 1)),
    status: "active",
    email: "drew.thompson@acme.example",
  },
  {
    externalEmployeeId: "PE0005",
    firstName: "Erin",
    lastName: "Patel",
    ssn: "555667777",
    dateOfBirth: new Date(Date.UTC(1988, 1, 14)),
    dateOfHire: new Date(Date.UTC(2026, 4, 1)),
    status: "active",
    email: "erin.patel@acme.example",
  },
  {
    externalEmployeeId: "PE0006",
    firstName: "Frankie",
    lastName: "O'Neil",
    ssn: "666778888",
    dateOfBirth: new Date(Date.UTC(1980, 9, 8)),
    dateOfHire: new Date(Date.UTC(2019, 3, 1)),
    dateOfTermination: new Date(Date.UTC(2026, 2, 31)),
    status: "terminated",
    email: "frankie.oneil@acme.example",
  },
  {
    externalEmployeeId: "PE0007",
    firstName: "Gabe",
    lastName: "Rivera",
    ssn: "777889999",
    dateOfBirth: new Date(Date.UTC(1987, 6, 19)),
    dateOfHire: new Date(Date.UTC(2024, 5, 15)),
    status: "rehired",
    email: "gabe.rivera@acme.example",
  },
  {
    externalEmployeeId: "PE0008",
    firstName: "Harper",
    lastName: "Singh",
    ssn: "888990000",
    dateOfBirth: new Date(Date.UTC(1991, 10, 27)),
    dateOfHire: new Date(Date.UTC(2021, 7, 9)),
    status: "leave",
    email: "harper.singh@acme.example",
  },
];

// Three biweekly payroll runs. April 1 was processed (terminated employee
// got final pay); April 15 was processed; April 29 is in draft.
export const MOCK_RUNS: ProviderPayrollRun[] = [
  {
    externalPayrollRunId: "PR-2026-08",
    payrollDate: new Date(Date.UTC(2026, 3, 1)),
    payPeriodStart: new Date(Date.UTC(2026, 2, 16)),
    payPeriodEnd: new Date(Date.UTC(2026, 2, 31)),
    status: "processed",
  },
  {
    externalPayrollRunId: "PR-2026-09",
    payrollDate: new Date(Date.UTC(2026, 3, 15)),
    payPeriodStart: new Date(Date.UTC(2026, 3, 1)),
    payPeriodEnd: new Date(Date.UTC(2026, 3, 14)),
    status: "processed",
  },
  {
    externalPayrollRunId: "PR-2026-10",
    payrollDate: new Date(Date.UTC(2026, 3, 29)),
    payPeriodStart: new Date(Date.UTC(2026, 3, 15)),
    payPeriodEnd: new Date(Date.UTC(2026, 3, 28)),
    status: "draft",
  },
];

// Pre-baked contribution detail per run. Numbers chosen so the validators
// fire predictably when this data is ingested:
//   - PE0005 was hired AFTER the April 15 payroll → contributing-before-
//     service-minimum warning
//   - PE0006 (terminated 2026-03-31) appears in the April 1 final-pay run
//     legitimately + April 15 with a deferral (critical issue)
//   - One row deliberately mismatches the expected match formula (PE0004)
export const MOCK_CONTRIBUTIONS: Record<string, ProviderContribution[]> = {
  "PR-2026-08": [
    contrib("PE0001", { gross: 4000, pre: 200, match: 140 }),
    contrib("PE0002", { gross: 3500, roth: 175, match: 131.25, loan: 175 }),
    contrib("PE0006", { gross: 2400, pre: 0, match: 0 }), // terminated final pay
    contrib("PE0007", { gross: 3200, pre: 160, match: 112 }),
    contrib("PE0008", { gross: 0, pre: 0, match: 0 }), // on leave
  ],
  "PR-2026-09": [
    contrib("PE0001", { gross: 4000, pre: 200, match: 140 }),
    contrib("PE0002", { gross: 3500, roth: 175, match: 131.25, loan: 175 }),
    contrib("PE0003", { gross: 2800, pre: 84, match: 84 }),
    contrib("PE0004", { gross: 5000, pre: 250, match: 100 }), // wrong match
    contrib("PE0006", { gross: 1200, pre: 60, match: 42 }), // terminated w/ deferral
    contrib("PE0007", { gross: 3200, pre: 160, match: 112 }),
  ],
  "PR-2026-10": [
    contrib("PE0001", { gross: 4000, pre: 200, match: 140 }),
    contrib("PE0002", { gross: 3500, roth: 175, match: 131.25, loan: 175 }),
    contrib("PE0003", { gross: 2800, pre: 84, match: 84 }),
    contrib("PE0004", { gross: 5000, pre: 250, match: 175 }),
    contrib("PE0005", { gross: 1500, pre: 75, match: 60 }), // hired post-payroll-date
    contrib("PE0007", { gross: 3200, pre: 160, match: 112 }),
  ],
};

function contrib(
  empId: string,
  v: { gross: number; pre?: number; roth?: number; match: number; loan?: number },
): ProviderContribution {
  return {
    externalEmployeeId: empId,
    sourceRecordId: `${empId}-${Math.floor(Math.random() * 1)}`, // deterministic 0
    grossCompensation: v.gross,
    preTaxDeferral: v.pre ?? 0,
    rothDeferral: v.roth ?? 0,
    employerMatch: v.match,
    loanRepayment: v.loan ?? 0,
    rawJson: {
      // Adapter exposes a redacted snapshot of what Paycor returned. SSN
      // and full bank info would NOT appear here in production.
      paycorEmployeeId: empId,
      paycorRunNumber: 0,
    },
  };
}

export function detailFor(runId: string): ProviderPayrollRunDetail | null {
  const run = MOCK_RUNS.find((r) => r.externalPayrollRunId === runId);
  if (!run) return null;
  return {
    ...run,
    contributions: MOCK_CONTRIBUTIONS[runId] ?? [],
  };
}
