import { describe, expect, it } from "vitest";

import { normalizeContributions } from "@/lib/normalization/engine";

describe("normalization engine", () => {
  const baseMapping = {
    externalEmployeeId: "Employee ID",
    ssn: "SSN",
    firstName: "First",
    lastName: "Last",
    payrollDate: "Pay Date",
    grossCompensation: "Gross",
    preTaxDeferral: "401k",
    rothDeferral: "Roth",
    employerMatch: "Match",
    loanRepayment: "Loan",
  };

  it("normalizes a clean row and extracts SSN out-of-band", () => {
    const result = normalizeContributions({
      mapping: baseMapping,
      rows: [
        {
          "Employee ID": "E001",
          SSN: "123-45-6789",
          First: "Pat",
          Last: "Sample",
          "Pay Date": "4/1/2025",
          Gross: "$4,000.00",
          "401k": "200",
          Roth: "0",
          Match: "120",
          Loan: "0",
        },
      ],
    });
    expect(result.normalized).toHaveLength(1);
    const c = result.normalized[0]!;
    expect(c.externalEmployeeId).toBe("E001");
    expect(c.ssnLast4).toBe("6789");
    expect(c.payrollDate.toISOString()).toBe("2025-04-01T00:00:00.000Z");
    expect(c.grossCompensation).toBe(4000);
    expect(c.preTaxDeferral).toBe(200);
    expect(c.employerMatch).toBe(120);
    // SSN plaintext is returned out-of-band, never on the contribution itself.
    expect(result.ssnByRow.get(0)).toBe("123456789");
    expect(result.issues).toEqual([]);
  });

  it("emits a parse issue and skips a row when payroll date is invalid", () => {
    const result = normalizeContributions({
      mapping: baseMapping,
      rows: [
        {
          "Employee ID": "E001",
          "Pay Date": "not a date",
          Gross: "1000",
        },
      ],
    });
    expect(result.normalized).toHaveLength(0);
    expect(result.issues[0]?.field).toBe("payrollDate");
  });

  it("emits a missing-required-field issue for empty employee id", () => {
    const result = normalizeContributions({
      mapping: baseMapping,
      rows: [
        {
          "Employee ID": "",
          "Pay Date": "2025-04-01",
          Gross: "1000",
        },
      ],
    });
    expect(result.normalized).toHaveLength(0);
    expect(result.issues[0]?.field).toBe("externalEmployeeId");
  });

  it("parses parenthesized negatives", () => {
    const result = normalizeContributions({
      mapping: baseMapping,
      rows: [
        {
          "Employee ID": "E1",
          "Pay Date": "2025-04-01",
          Gross: "(50.25)",
        },
      ],
    });
    expect(result.normalized[0]?.grossCompensation).toBe(-50.25);
  });
});
