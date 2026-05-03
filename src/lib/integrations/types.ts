// Payroll-provider adapter interface + canonical types.
//
// Each integration (Paycor, ADP, Gusto, …) implements this interface against
// its own wire protocol. The adapter is responsible for normalizing the
// provider's data shape into our canonical types — no Paycor-shaped fields
// leak into lib/services/* or the database layer.
//
// Shape mirrors CLAUDE.md §8.2; refined with explicit canonical types for
// every wire response so the rest of the codebase doesn't see provider
// idiosyncrasies (Paycor returns dates as strings, ADP as ISO with offsets,
// etc. — all coalesced into native Date here).

export type PayrollProviderName =
  | "paycor"
  | "adp"
  | "gusto"
  | "paychex"
  | "isolved"
  | "quickbooks";

// Inputs

export type ConnectParams = {
  // OAuth authorization-code flow returns these fields to our callback.
  authorizationCode: string;
  redirectUri: string;
  // The PayrollConnection row we're attaching tokens to.
  connectionId: string;
};

export type SyncParams = {
  // Optional time range. Adapters paginate internally; the interface
  // returns a single bounded list to keep call sites simple.
  since?: Date;
  until?: Date;
  // Optional page-size hint; adapters may ignore.
  pageSize?: number;
};

export type ProviderDeferralUpdate = {
  externalEmployeeId: string;
  preTaxPercent?: number;
  preTaxAmount?: number;
  rothPercent?: number;
  rothAmount?: number;
  effectiveDate: Date;
};

export type ProviderLoanUpdate = {
  externalEmployeeId: string;
  externalLoanId: string;
  newPaymentAmount: number;
  effectiveDate: Date;
};

// Outputs

export type ConnectionResult = {
  // Provider-side identifier for this connection (Paycor account id, ADP
  // client id). Stored in PayrollConnection.settingsJson.
  providerAccountId: string;
  // Display name for the connected company / tenant.
  providerCompanyName: string;
  // Tokens, encrypted by the caller before persisting.
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
  // Scope strings the provider granted.
  scopes?: string[];
};

export type TokenRefreshResult = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
};

export type ProviderCompany = {
  externalCompanyId: string;
  legalName: string;
  ein?: string;
  // Recordkeeper info if the provider tracks it.
  recordkeeper?: string;
};

export type ProviderEmployee = {
  externalEmployeeId: string;
  firstName: string;
  lastName: string;
  // Plaintext SSN. Caller is responsible for encrypting before persisting;
  // adapters MUST NOT log this value.
  ssn?: string;
  dateOfBirth?: Date;
  dateOfHire?: Date;
  dateOfTermination?: Date;
  status: "active" | "terminated" | "rehired" | "leave";
  email?: string;
};

export type ProviderPayrollRun = {
  externalPayrollRunId: string;
  payrollDate: Date;
  payPeriodStart?: Date;
  payPeriodEnd?: Date;
  status: "draft" | "processed" | "void" | "unknown";
};

export type ProviderContribution = {
  externalEmployeeId: string;
  // Source-system row id, persisted on PayrollContribution.sourceRecordId
  // for traceability back to the provider's record.
  sourceRecordId?: string;
  grossCompensation: number;
  eligibleCompensation?: number;
  preTaxDeferral: number;
  rothDeferral: number;
  afterTaxContribution?: number;
  employerMatch: number;
  safeHarborMatch?: number;
  safeHarborNonelective?: number;
  profitSharing?: number;
  loanRepayment: number;
  // Provider-shaped raw row for the audit trail. Adapters must REDACT any
  // sensitive fields the rest of the system shouldn't see (full SSN, raw
  // OAuth tokens, internal account ids).
  rawJson?: Record<string, unknown>;
};

export type ProviderPayrollRunDetail = ProviderPayrollRun & {
  contributions: ProviderContribution[];
};

export type ProviderDeduction = {
  externalDeductionId: string;
  // Provider's code (e.g. Paycor "401K", ADP "PRETAX_401K"). Adapters
  // typically also expose a normalized type below.
  code: string;
  description: string;
  // Normalized deduction kind. The deduction-mapping screen lets operators
  // override when the provider's classification is wrong / missing.
  type:
    | "pretax_401k"
    | "roth_401k"
    | "after_tax"
    | "loan_repayment"
    | "match"
    | "other";
};

export type ProviderWritebackResult = {
  // Provider's confirmation id; persisted in audit metadata.
  providerConfirmationId?: string;
  effectiveDate: Date;
};

export type AuthorizeUrlParams = {
  // CSRF / state-binding token; round-trips through the provider's
  // authorize → callback redirect untouched. The OAuth start route signs
  // the state; the callback route verifies it.
  state: string;
  // The exact URL the provider must redirect back to. Must be one the
  // operator pre-registered with the provider (Paycor Marketplace etc.).
  redirectUri: string;
  // Optional scope override; defaults are chosen per-adapter.
  scopes?: string[];
};

// The adapter contract.

export interface PayrollProviderAdapter {
  readonly provider: PayrollProviderName;

  // ---- OAuth lifecycle ----
  // Returns the URL the user's browser should be redirected to in order
  // to authorize this app on the provider's side. Synchronous because it's
  // a pure URL construction (no network call). Mock implementations point
  // at an internal /mock-authorize route; live implementations point at
  // the provider's real authorize endpoint.
  getAuthorizeUrl(params: AuthorizeUrlParams): string;
  connect(params: ConnectParams): Promise<ConnectionResult>;
  refreshToken?(connectionId: string): Promise<TokenRefreshResult>;

  // ---- Read-only sync ----
  getCompany(connectionId: string): Promise<ProviderCompany>;
  getEmployees(
    connectionId: string,
    params?: SyncParams,
  ): Promise<ProviderEmployee[]>;
  getPayrollRuns(
    connectionId: string,
    params?: SyncParams,
  ): Promise<ProviderPayrollRun[]>;
  getPayrollRunDetails(
    connectionId: string,
    externalPayrollRunId: string,
  ): Promise<ProviderPayrollRunDetail>;
  getDeductions?(connectionId: string): Promise<ProviderDeduction[]>;

  // ---- Write-back (Phase 4) ----
  updateDeferralElection?(
    connectionId: string,
    input: ProviderDeferralUpdate,
  ): Promise<ProviderWritebackResult>;
  updateLoanRepayment?(
    connectionId: string,
    input: ProviderLoanUpdate,
  ): Promise<ProviderWritebackResult>;
}
