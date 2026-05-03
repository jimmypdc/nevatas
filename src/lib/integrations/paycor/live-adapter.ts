// Paycor live adapter. Stubbed in Phase 2 Round 1 — selecting
// PAYCOR_DRIVER=live without wiring will throw on construction with a
// pointer to this file so the operator follows the checklist before
// touching production data.
//
// Wiring checklist:
//
//   1. Register a Paycor Marketplace developer account and create an
//      OAuth application. Note the client_id, client_secret, and the
//      authorization / token / API base URLs (sandbox vs production are
//      different).
//
//   2. Configure the OAuth redirect URI on the Paycor app to match
//      `<APP_URL>/api/integrations/paycor/callback`. APP_URL must match
//      the host the user's browser hits during the OAuth dance.
//
//   3. Put the credentials in the secrets manager:
//        PAYCOR_CLIENT_ID
//        PAYCOR_CLIENT_SECRET
//        PAYCOR_API_BASE_URL        (e.g., https://api.paycor.com)
//        PAYCOR_AUTH_BASE_URL       (e.g., https://auth.paycor.com)
//      (See lib/secrets/.) For dev with PAYCOR_DRIVER=live, plain env vars
//      are fine.
//
//   4. Replace each method body below with the corresponding Paycor REST
//      call. Paycor returns paginated results — getEmployees /
//      getPayrollRuns must walk pages until the cursor exhausts.
//
//   5. Token refresh: implement refreshToken() against Paycor's OAuth
//      refresh endpoint. The PayrollConnection row stores access + refresh
//      tokens encrypted via FIELD_ENCRYPTION_KEY; this adapter receives
//      the connectionId and is responsible for fetching + decrypting via
//      lib/services/payroll-connection.ts (built in Phase 2 Round 3).
//
//   6. Error handling: 401 → call refreshToken once, retry with new token;
//      429 → respect Retry-After; 5xx → exponential backoff (the
//      BackgroundJob queue's nextBackoff() helper is reusable).
//
//   7. NEVER log access tokens, refresh tokens, full SSNs, or raw payroll
//      payloads. The rawJson field on ProviderContribution is intentionally
//      a redacted snapshot — populate it with non-sensitive metadata only.
//
//   8. Tests: build a fixtures-based test harness that records actual
//      sandbox responses (with secrets scrubbed) and replays them. Phase 2
//      Round 5 covers this.

import type {
  ConnectParams,
  ConnectionResult,
  AuthorizeUrlParams,
  PayrollProviderAdapter,
  ProviderCompany,
  ProviderDeduction,
  ProviderEmployee,
  ProviderPayrollRun,
  ProviderPayrollRunDetail,
  SyncParams,
  TokenRefreshResult,
} from "@/lib/integrations/types";

export class PaycorLiveAdapter implements PayrollProviderAdapter {
  readonly provider = "paycor" as const;

  constructor() {
    const clientId = process.env.PAYCOR_CLIENT_ID;
    const clientSecret = process.env.PAYCOR_CLIENT_SECRET;
    const apiBase = process.env.PAYCOR_API_BASE_URL;
    if (!clientId || !clientSecret || !apiBase) {
      throw new Error(
        "PaycorLiveAdapter requires PAYCOR_CLIENT_ID, PAYCOR_CLIENT_SECRET, and PAYCOR_API_BASE_URL. " +
          "See lib/integrations/paycor/live-adapter.ts for the wiring checklist.",
      );
    }
  }

  getAuthorizeUrl(params: AuthorizeUrlParams): string {
    const authBase =
      process.env.PAYCOR_AUTH_BASE_URL ?? process.env.PAYCOR_API_BASE_URL!;
    const url = new URL("/oauth/authorize", authBase);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", process.env.PAYCOR_CLIENT_ID!);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("state", params.state);
    url.searchParams.set(
      "scope",
      (params.scopes ?? ["company:read", "employees:read", "payroll:read"]).join(" "),
    );
    return url.toString();
  }

  async connect(_params: ConnectParams): Promise<ConnectionResult> {
    // Production:
    //   const res = await fetch(`${env().PAYCOR_AUTH_BASE_URL}/oauth/token`, {
    //     method: "POST",
    //     headers: { "content-type": "application/x-www-form-urlencoded" },
    //     body: new URLSearchParams({
    //       grant_type: "authorization_code",
    //       code: _params.authorizationCode,
    //       redirect_uri: _params.redirectUri,
    //       client_id: env().PAYCOR_CLIENT_ID!,
    //       client_secret: env().PAYCOR_CLIENT_SECRET!,
    //     }),
    //   });
    //   const json = await res.json();
    //   const me = await this._fetchAuthenticated(`/companies/me`, json.access_token);
    //   return {
    //     providerAccountId: me.companyId,
    //     providerCompanyName: me.legalName,
    //     accessToken: json.access_token,
    //     refreshToken: json.refresh_token,
    //     accessTokenExpiresAt: new Date(Date.now() + json.expires_in * 1000),
    //     scopes: (json.scope ?? "").split(" "),
    //   };
    throw notImpl("connect");
  }

  async refreshToken(_connectionId: string): Promise<TokenRefreshResult> {
    throw notImpl("refreshToken");
  }

  async getCompany(_connectionId: string): Promise<ProviderCompany> {
    throw notImpl("getCompany");
  }

  async getEmployees(
    _connectionId: string,
    _params?: SyncParams,
  ): Promise<ProviderEmployee[]> {
    throw notImpl("getEmployees");
  }

  async getPayrollRuns(
    _connectionId: string,
    _params?: SyncParams,
  ): Promise<ProviderPayrollRun[]> {
    throw notImpl("getPayrollRuns");
  }

  async getPayrollRunDetails(
    _connectionId: string,
    _externalPayrollRunId: string,
  ): Promise<ProviderPayrollRunDetail> {
    throw notImpl("getPayrollRunDetails");
  }

  async getDeductions(_connectionId: string): Promise<ProviderDeduction[]> {
    throw notImpl("getDeductions");
  }
}

function notImpl(method: string): Error {
  return new Error(
    `PaycorLiveAdapter.${method} is not implemented. See lib/integrations/paycor/live-adapter.ts for the wiring checklist.`,
  );
}
