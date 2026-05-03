import { describe, expect, it } from "vitest";

import { detectCsvInjection } from "@/lib/normalization/csv-injection";

const mapping = {
  externalEmployeeId: "Employee ID",
  firstName: "First",
  grossCompensation: "Gross",
};

describe("detectCsvInjection", () => {
  it("flags cells starting with =", () => {
    const issues = detectCsvInjection({
      rows: [{ "Employee ID": "E001", First: "=cmd|'/c calc'!A1", Gross: "1000" }],
      mapping,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.ruleKey).toBe("data_quality.csv_injection_risk");
    expect(issues[0]?.severity).toBe("warning");
    expect(issues[0]?.sourceField).toBe("First");
  });

  it("flags +, -, @ prefixes", () => {
    const issues = detectCsvInjection({
      rows: [
        { "Employee ID": "E1", First: "+SUM(A1:B1)", Gross: "1" },
        { "Employee ID": "E2", First: "-2+3", Gross: "1" },
        { "Employee ID": "E3", First: "@HYPERLINK", Gross: "1" },
      ],
      mapping,
    });
    expect(issues).toHaveLength(3);
  });

  it("flags tab and carriage-return prefixes (DDE vectors)", () => {
    const issues = detectCsvInjection({
      rows: [
        { "Employee ID": "E1", First: "\tcmd", Gross: "1" },
        { "Employee ID": "E2", First: "\rDDE", Gross: "1" },
      ],
      mapping,
    });
    expect(issues).toHaveLength(2);
    expect(issues[0]?.message).toMatch(/tab/);
    expect(issues[1]?.message).toMatch(/carriage return/);
  });

  it("ignores cells in unmapped columns", () => {
    const issues = detectCsvInjection({
      rows: [{ "Employee ID": "E1", First: "Pat", Notes: "=DANGER", Gross: "1" }],
      mapping,
    });
    expect(issues).toEqual([]);
  });

  it("ignores benign cells", () => {
    const issues = detectCsvInjection({
      rows: [
        { "Employee ID": "E1", First: "Pat", Gross: "1000.00" },
        { "Employee ID": "E2", First: "O'Brien", Gross: "$3,500" },
        { "Employee ID": "E3", First: "Smith, Jr.", Gross: "0" },
      ],
      mapping,
    });
    expect(issues).toEqual([]);
  });

  it("truncates long values in actualValue for the audit log", () => {
    const long = "=" + "A".repeat(200);
    const issues = detectCsvInjection({
      rows: [{ "Employee ID": "E1", First: long, Gross: "1" }],
      mapping,
    });
    expect(issues[0]?.actualValue?.length).toBeLessThanOrEqual(65);
    expect(issues[0]?.actualValue?.endsWith("…")).toBe(true);
  });

  it("does not flag empty cells", () => {
    const issues = detectCsvInjection({
      rows: [{ "Employee ID": "E1", First: "", Gross: "" }],
      mapping,
    });
    expect(issues).toEqual([]);
  });
});
