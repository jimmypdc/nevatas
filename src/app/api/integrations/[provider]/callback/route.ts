// OAuth callback route. The provider redirects here with the
// authorization code (success) or an error parameter (failure). We:
//
//   1. Verify state HMAC + expiry + provider-binding.
//   2. Refuse if no actor session OR session userId differs from state.userId
//      (state is signed but a stolen state replayed in someone else's
//      browser would otherwise attach the wrong user's tokens).
//   3. Exchange the code for tokens via adapter.connect().
//   4. Persist encrypted tokens via persistTokens() (active status, audit).
//   5. Redirect to a connection-success page.
//
// Errors land on a connection-error page with the failure reason. We
// never show raw provider error responses to the user — those are logged
// server-side; the user gets a sanitized message.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { adapterFor } from "@/lib/integrations/registry";
import type { PayrollProviderName } from "@/lib/integrations/types";
import { verifyOAuthState } from "@/lib/integrations/oauth-state";
import { persistTokens } from "@/lib/services/payroll-connection";
import { getCurrentUserId } from "@/lib/session";

const ProviderEnum = z.enum([
  "paycor",
  "adp",
  "gusto",
  "paychex",
  "isolved",
  "quickbooks",
]);

export async function GET(
  req: NextRequest,
  routeContext: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const params = await routeContext.params;
  const providerParse = ProviderEnum.safeParse(params.provider);
  if (!providerParse.success) {
    return errorRedirect("unknown_provider");
  }
  const provider = providerParse.data as PayrollProviderName;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  // Provider denied / errored out before issuing a code.
  if (providerError) {
    console.error("[oauth-callback] provider rejected", { provider, providerError });
    return errorRedirect("provider_denied", provider);
  }
  if (!code || !state) {
    return errorRedirect("missing_params", provider);
  }

  // Verify state — CSRF defense + connection-id resolution.
  const v = verifyOAuthState(state, provider);
  if (!v.ok) {
    console.error("[oauth-callback] state verification failed", { provider, reason: v.reason });
    return errorRedirect(`state_${v.reason}`, provider);
  }

  // Bind to the current session — refuses the swap-browser-mid-flow attack.
  const sessionUserId = await getCurrentUserId();
  if (!sessionUserId || sessionUserId !== v.payload.userId) {
    return errorRedirect("session_mismatch", provider);
  }

  // Confirm the connection still exists + still maps to the same org/company.
  const conn = await db.payrollConnection.findUnique({
    where: { id: v.payload.connectionId },
    include: { company: { select: { id: true, organizationId: true } } },
  });
  if (
    !conn ||
    conn.company.organizationId !== v.payload.organizationId ||
    conn.company.id !== v.payload.companyId
  ) {
    return errorRedirect("connection_missing", provider);
  }

  // Exchange the code for tokens via the adapter.
  const adapter = adapterFor(provider);
  const redirectUri = `${env().APP_URL.replace(/\/+$/, "")}/api/integrations/${provider}/callback`;
  let result;
  try {
    result = await adapter.connect({
      authorizationCode: code,
      redirectUri,
      connectionId: conn.id,
    });
  } catch (err) {
    console.error("[oauth-callback] code exchange failed", {
      provider,
      err: err instanceof Error ? err.message : String(err),
    });
    return errorRedirect("token_exchange_failed", provider);
  }

  // Update the settings blob with the provider-side identifiers we just
  // learned. Done here (not in persistTokens) because settings live
  // alongside, not inside, the encrypted token bundle.
  await db.payrollConnection.update({
    where: { id: conn.id },
    data: {
      settingsJson: {
        ...((conn.settingsJson as object | null) ?? {}),
        providerAccountId: result.providerAccountId,
        providerCompanyName: result.providerCompanyName,
        connectedByUserId: sessionUserId,
        connectedAt: new Date().toISOString(),
      },
    },
  });

  await persistTokens({
    organizationId: v.payload.organizationId,
    companyId: v.payload.companyId,
    actorUserId: sessionUserId,
    connectionId: conn.id,
    tokens: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      scopes: result.scopes,
    },
    reason: "initial_connect",
  });

  return successRedirect(provider, conn.id);
}

function successRedirect(provider: string, connectionId: string): Response {
  const url = new URL("/app/dashboard", env().APP_URL);
  url.searchParams.set("connected", provider);
  url.searchParams.set("conn", connectionId);
  return NextResponse.redirect(url, { status: 302 });
}

function errorRedirect(reason: string, provider?: string): Response {
  const url = new URL("/app/dashboard", env().APP_URL);
  url.searchParams.set("connect_error", reason);
  if (provider) url.searchParams.set("provider", provider);
  return NextResponse.redirect(url, { status: 302 });
}
