import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { templateOrDefault, TEMPLATE_REGISTRY } from "@/lib/recordkeepers";
import type { ContributionRow, RenderInput } from "@/lib/recordkeepers/template";

function row(over: Partial<ContributionRow> = {}): ContributionRow {
  return {
    externalEmployeeId: "E001",
    participantFirstName: "Pat",
    participantLastName: "Sample",
    participantSsnLast4: "1234",
    grossCompensation: new Prisma.Decimal("4000.00"),
    preTaxDeferral: new Prisma.Decimal("200.00"),
    rothDeferral: new Prisma.Decimal("0.00"),
    employerMatch: new Prisma.Decimal("120.00"),
    loanRepayment: new Prisma.Decimal("0.00"),
    ...over,
  };
}

function input(rows: ContributionRow[]): RenderInput {
  return {
    payrollDate: new Date("2026-04-15T00:00:00Z"),
    contributions: rows,
    planName: "Acme 401(k) Plan",
    planNumber: "001",
    companyName: "Acme Industries Inc.",
  };
}

describe("recordkeeper template registry", () => {
  it("registers stable keys", () => {
    expect(TEMPLATE_REGISTRY.map((t) => t.key)).toContain("nevatas.v1");
    expect(TEMPLATE_REGISTRY.map((t) => t.key)).toContain("empower.v1");
    expect(TEMPLATE_REGISTRY.map((t) => t.key)).toContain("fidelity.v1");
  });

  it("falls back to nevatas.v1 for an unknown key", () => {
    expect(templateOrDefault("not-a-real-template").key).toBe("nevatas.v1");
  });

  it("falls back to nevatas.v1 for null", () => {
    expect(templateOrDefault(null).key).toBe("nevatas.v1");
  });
});

describe("nevatas.v1 template", () => {
  it("renders ISO date and ssn-last-4 only", () => {
    const t = templateOrDefault("nevatas.v1");
    const out = t.render(input([row()]));
    const text = out.bytes.toString("utf8");
    expect(text).toContain("2026-04-15");
    expect(text).toContain("1234"); // last 4
    expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/); // no full SSN
    // Header order is fixed.
    expect(text.split("\n")[0]).toBe(
      "payroll_date,employee_id,first_name,last_name,ssn_last4,gross_compensation,pretax_deferral,roth_deferral,employer_match,loan_repayment",
    );
  });

  it("escapes commas + quotes in name fields", () => {
    const t = templateOrDefault("nevatas.v1");
    const out = t.render(input([row({ participantLastName: "Smith, Jr." })]));
    expect(out.bytes.toString("utf8")).toContain('"Smith, Jr."');
  });
});

describe("empower.v1 template", () => {
  it("uses MM/DD/YYYY date and emits a TOTAL row", () => {
    const t = templateOrDefault("empower.v1");
    const out = t.render(
      input([
        row({ grossCompensation: new Prisma.Decimal("1000.00"), preTaxDeferral: new Prisma.Decimal("50.00") }),
        row({ externalEmployeeId: "E002", grossCompensation: new Prisma.Decimal("2000.00"), preTaxDeferral: new Prisma.Decimal("100.00") }),
      ]),
    );
    const text = out.bytes.toString("utf8");
    expect(text).toContain("04/15/2026");
    expect(text).toMatch(/\nTOTAL,/);
    expect(text).toContain("3000.00"); // sum of gross
    expect(text).toContain("150.00"); // sum of pretax
  });

  it("uses CRLF line endings (Empower expects DOS-style)", () => {
    const t = templateOrDefault("empower.v1");
    const out = t.render(input([row()]));
    expect(out.bytes.toString("utf8")).toContain("\r\n");
  });
});

describe("fidelity.v1 template", () => {
  it("emits pipe-delimited records with YYYYMMDD date and plan-number prefix", () => {
    const t = templateOrDefault("fidelity.v1");
    const out = t.render(input([row()]));
    const text = out.bytes.toString("utf8");
    const detail = text.split(/\r?\n/)[1] ?? "";
    expect(detail.startsWith("001|20260415|")).toBe(true);
    expect(detail.split("|").length).toBe(11);
  });

  it("strips embedded pipe characters from values", () => {
    const t = templateOrDefault("fidelity.v1");
    const out = t.render(input([row({ participantLastName: "Pi|pe" })]));
    expect(out.bytes.toString("utf8")).toContain("Pi pe");
    expect(out.bytes.toString("utf8")).not.toContain("Pi|pe");
  });
});
