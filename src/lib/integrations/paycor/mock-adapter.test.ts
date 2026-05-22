import { describe, expect, it } from "vitest";

import { PaycorMockAdapter } from "@/lib/integrations/paycor/mock-adapter";
import { adapterFor } from "@/lib/integrations/registry";

const CONN = "conn-test-001";

describe("PaycorMockAdapter", () => {
  const adapter = new PaycorMockAdapter();

  it("registers under the paycor provider key", () => {
    expect(adapter.provider).toBe("paycor");
    expect(adapterFor("paycor").provider).toBe("paycor");
  });

  // ---------- connect ----------

  it("connect rejects an empty authorization code", async () => {
    await expect(
      adapter.connect({ authorizationCode: "", redirectUri: "http://x", connectionId: CONN }),
    ).rejects.toThrow();
  });

  it("connect returns canonical token + scope shape", async () => {
    const r = await adapter.connect({
      authorizationCode: "fake-auth-code",
      redirectUri: "http://localhost:3000/api/integrations/paycor/callback",
      connectionId: CONN,
    });
    expect(r.providerAccountId).toBeTruthy();
    expect(r.providerCompanyName).toContain("Acme");
    expect(r.accessToken).toContain(CONN);
    expect(r.refreshToken).toContain(CONN);
    expect(r.accessTokenExpiresAt).toBeInstanceOf(Date);
    expect(r.scopes).toContain("payroll:read");
  });

  it("refreshToken returns a new access token but reuses refresh token", async () => {
    const r = await adapter.refreshToken(CONN);
    expect(r.accessToken).toContain(CONN);
    expect(r.refreshToken).toContain(CONN);
    expect(r.accessTokenExpiresAt).toBeInstanceOf(Date);
  });

  // ---------- read endpoints ----------

  it("getCompany returns the canonical company shape", async () => {
    const c = await adapter.getCompany(CONN);
    expect(c.externalCompanyId).toBeTruthy();
    expect(c.legalName).toBeTruthy();
  });

  it("getEmployees returns 8 deterministic employees with mixed eligibility states", async () => {
    const a = await adapter.getEmployees(CONN);
    const b = await adapter.getEmployees(CONN);
    expect(a.length).toBe(8);
    expect(a.map((e) => e.externalEmployeeId)).toEqual(
      b.map((e) => e.externalEmployeeId),
    );
    // Status mix exercised by the validators
    expect(a.some((e) => e.status === "active")).toBe(true);
    expect(a.some((e) => e.status === "terminated")).toBe(true);
    expect(a.some((e) => e.status === "rehired")).toBe(true);
    expect(a.some((e) => e.status === "leave")).toBe(true);
  });

  it("getEmployees returns defensive copies (caller mutation does not bleed)", async () => {
    const first = await adapter.getEmployees(CONN);
    first[0]!.firstName = "MUTATED";
    const second = await adapter.getEmployees(CONN);
    expect(second[0]!.firstName).not.toBe("MUTATED");
  });

  it("getPayrollRuns honors since / until filters", async () => {
    const all = await adapter.getPayrollRuns(CONN);
    expect(all.length).toBeGreaterThanOrEqual(3);

    const apr15Onward = await adapter.getPayrollRuns(CONN, {
      since: new Date("2026-04-15"),
    });
    expect(apr15Onward.length).toBe(2); // 04-15 and 04-29
    expect(apr15Onward.every((r) => r.payrollDate >= new Date("2026-04-15"))).toBe(true);

    const onlyFirst = await adapter.getPayrollRuns(CONN, {
      until: new Date("2026-04-01"),
    });
    expect(onlyFirst.length).toBe(1);
  });

  it("getPayrollRunDetails returns contributions for a known run id", async () => {
    const d = await adapter.getPayrollRunDetails(CONN, "PR-2026-09");
    expect(d.externalPayrollRunId).toBe("PR-2026-09");
    expect(d.contributions.length).toBeGreaterThan(0);
    // Every contribution has the canonical numeric fields populated.
    for (const c of d.contributions) {
      expect(typeof c.grossCompensation).toBe("number");
      expect(typeof c.preTaxDeferral).toBe("number");
      expect(typeof c.rothDeferral).toBe("number");
      expect(typeof c.employerMatch).toBe("number");
      expect(typeof c.loanRepayment).toBe("number");
    }
  });

  it("getPayrollRunDetails throws notFound on an unknown run id", async () => {
    await expect(adapter.getPayrollRunDetails(CONN, "PR-NOPE")).rejects.toThrow();
  });

  it("getDeductions returns the canonical 401k / roth / match / loan set", async () => {
    const d = await adapter.getDeductions(CONN);
    const types = d.map((x) => x.type);
    expect(types).toContain("pretax_401k");
    expect(types).toContain("roth_401k");
    expect(types).toContain("match");
    expect(types).toContain("loan_repayment");
  });

  // ---------- canonical-shape contracts ----------

  it("PE0006 (terminated) appears with a deferral on PR-2026-09 — drives eligibility validators", async () => {
    const d = await adapter.getPayrollRunDetails(CONN, "PR-2026-09");
    const term = d.contributions.find((c) => c.externalEmployeeId === "PE0006");
    expect(term).toBeDefined();
    expect(term!.preTaxDeferral).toBeGreaterThan(0);
  });

  it("PE0004 carries a deliberate match-formula mismatch on PR-2026-09", async () => {
    const d = await adapter.getPayrollRunDetails(CONN, "PR-2026-09");
    const drew = d.contributions.find((c) => c.externalEmployeeId === "PE0004");
    expect(drew).toBeDefined();
    // 250 deferred on 5000 = 5%; tiered 100/3 + 50/2 = 175 expected; mock is 100.
    expect(drew!.employerMatch).toBe(100);
  });

  it("rawJson on contributions is non-sensitive metadata only (no SSN, no full row dump)", async () => {
    const d = await adapter.getPayrollRunDetails(CONN, "PR-2026-09");
    for (const c of d.contributions) {
      const raw = c.rawJson ?? {};
      const stringified = JSON.stringify(raw).toLowerCase();
      expect(stringified).not.toMatch(/\d{9}/); // no SSN-shaped digits
      expect(stringified).not.toContain("ssn");
      expect(stringified).not.toContain("password");
    }
  });

  // ---------- write-back (Phase 4) ----------

  it("updateDeferralElection returns a confirmation id for normal input", async () => {
    const r = await adapter.updateDeferralElection!(CONN, {
      externalEmployeeId: "EMP-1001",
      effectiveDate: new Date(),
      preTaxPercent: 6,
    });
    expect(r.providerConfirmationId).toMatch(/^PAYCOR-MOCK-WB-/);
    expect(r.effectiveDate).toBeInstanceOf(Date);
  });

  it("updateDeferralElection rejects the seeded 'unknown employee' marker", async () => {
    await expect(
      adapter.updateDeferralElection!(CONN, {
        externalEmployeeId: "EMP-999999",
        effectiveDate: new Date(),
        preTaxPercent: 4,
      }),
    ).rejects.toThrow(/unknown employee/i);
  });

  it("updateDeferralElection rejects back-dated effectiveDate (>30 days)", async () => {
    const wayBack = new Date(Date.now() - 60 * 86400_000);
    await expect(
      adapter.updateDeferralElection!(CONN, {
        externalEmployeeId: "EMP-1001",
        effectiveDate: wayBack,
        preTaxPercent: 6,
      }),
    ).rejects.toThrow(/back-dat|past/i);
  });
});
