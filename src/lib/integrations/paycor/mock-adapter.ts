// Paycor mock adapter. Returns deterministic data for local development +
// tests, satisfying the full PayrollProviderAdapter contract without
// requiring real Paycor sandbox credentials.
//
// Default driver in dev. Production must flip PAYCOR_DRIVER=live and supply
// the OAuth client credentials documented in live-adapter.ts.

import { env } from "@/lib/env";
import { notFound } from "@/lib/errors";
import type {
  AuthorizeUrlParams,
  ConnectParams,
  ConnectionResult,
  PayrollProviderAdapter,
  ProviderCompany,
  ProviderDeduction,
  ProviderDeferralUpdate,
  ProviderEmployee,
  ProviderPayrollRun,
  ProviderPayrollRunDetail,
  ProviderWritebackResult,
  SyncParams,
  TokenRefreshResult,
} from "@/lib/integrations/types";

import {
  MOCK_COMPANY,
  MOCK_EMPLOYEES,
  MOCK_RUNS,
  detailFor,
} from "@/lib/integrations/paycor/mock-data";

const MOCK_DEDUCTIONS: ProviderDeduction[] = [
  { externalDeductionId: "DED-401K", code: "401K", description: "401(k) Pre-Tax", type: "pretax_401k" },
  { externalDeductionId: "DED-ROTH", code: "ROTH", description: "401(k) Roth", type: "roth_401k" },
  { externalDeductionId: "DED-MATCH", code: "ER_MATCH", description: "Employer Match", type: "match" },
  { externalDeductionId: "DED-LOAN", code: "LOAN", description: "401(k) Loan Repayment", type: "loan_repayment" },
];

export class PaycorMockAdapter implements PayrollProviderAdapter {
  readonly provider = "paycor" as const;

  getAuthorizeUrl(params: AuthorizeUrlParams): string {
    // Mock IdP lives at /api/integrations/paycor/mock-authorize. It echoes
    // the same state + redirect_uri the live flow would carry, so the
    // callback handler is identical between mock and live modes.
    const url = new URL("/api/integrations/paycor/mock-authorize", env().APP_URL);
    url.searchParams.set("state", params.state);
    url.searchParams.set("redirect_uri", params.redirectUri);
    if (params.scopes?.length) {
      url.searchParams.set("scope", params.scopes.join(" "));
    }
    return url.toString();
  }

  async connect(params: ConnectParams): Promise<ConnectionResult> {
    // Simulate an OAuth code-exchange response. Tokens are dummy strings;
    // the caller still encrypts them at the FIELD_ENCRYPTION_KEY layer.
    if (!params.authorizationCode) throw notFound("authorization code");
    return {
      providerAccountId: "PAYCOR-MOCK-ACCT-001",
      providerCompanyName: MOCK_COMPANY.legalName,
      accessToken: `mock_access_${params.connectionId}`,
      refreshToken: `mock_refresh_${params.connectionId}`,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
      scopes: ["company:read", "employees:read", "payroll:read"],
    };
  }

  async refreshToken(connectionId: string): Promise<TokenRefreshResult> {
    return {
      accessToken: `mock_access_${connectionId}_${Date.now()}`,
      refreshToken: `mock_refresh_${connectionId}`,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
    };
  }

  async getCompany(_connectionId: string): Promise<ProviderCompany> {
    return MOCK_COMPANY;
  }

  async getEmployees(
    _connectionId: string,
    _params?: SyncParams,
  ): Promise<ProviderEmployee[]> {
    // Defensive copy so callers can mutate without affecting the source.
    return MOCK_EMPLOYEES.map((e) => ({ ...e }));
  }

  async getPayrollRuns(
    _connectionId: string,
    params?: SyncParams,
  ): Promise<ProviderPayrollRun[]> {
    let rows = MOCK_RUNS.map((r) => ({ ...r }));
    if (params?.since) rows = rows.filter((r) => r.payrollDate >= params.since!);
    if (params?.until) rows = rows.filter((r) => r.payrollDate <= params.until!);
    return rows;
  }

  async getPayrollRunDetails(
    _connectionId: string,
    externalPayrollRunId: string,
  ): Promise<ProviderPayrollRunDetail> {
    const detail = detailFor(externalPayrollRunId);
    if (!detail) throw notFound(`payroll run ${externalPayrollRunId}`);
    // Defensive copy.
    return {
      ...detail,
      contributions: detail.contributions.map((c) => ({ ...c })),
    };
  }

  async getDeductions(_connectionId: string): Promise<ProviderDeduction[]> {
    return MOCK_DEDUCTIONS.map((d) => ({ ...d }));
  }

  // Write-back: deferral election update.
  //
  // The mock simulates Paycor's behavior with two deterministic
  // failure modes — useful for demoing the retry path against realistic
  // provider errors without requiring sandbox credentials:
  //   - externalEmployeeId === "EMP-999999" → permanent "unknown employee"
  //   - effectiveDate older than 30 days  → permanent "back-dating not
  //     permitted" (mirrors most providers' policy)
  // Everything else returns a fabricated confirmation id.
  async updateDeferralElection(
    _connectionId: string,
    input: ProviderDeferralUpdate,
  ): Promise<ProviderWritebackResult> {
    if (input.externalEmployeeId === "EMP-999999") {
      throw new Error(`Paycor (mock): unknown employee ${input.externalEmployeeId}`);
    }
    const backDateCutoff = Date.now() - 30 * 86400_000;
    if (input.effectiveDate.getTime() < backDateCutoff) {
      throw new Error(
        `Paycor (mock): effectiveDate ${input.effectiveDate.toISOString().slice(0, 10)} is more than 30 days in the past`,
      );
    }
    return {
      providerConfirmationId: `PAYCOR-MOCK-WB-${Date.now()}`,
      effectiveDate: input.effectiveDate,
    };
  }
}
