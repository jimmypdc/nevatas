// Dev-only mock IdP. Stands in for the provider's authorize screen when
// PAYCOR_DRIVER (or any *_DRIVER) is set to "mock". Immediately redirects
// back to the callback with a fabricated authorization code, preserving
// state untouched.
//
// Hard-gated on NODE_ENV !== "production". Production must use the real
// provider's authorize URL, period.

import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";

export async function GET(
  req: NextRequest,
  routeContext: { params: Promise<{ provider: string }> },
): Promise<Response> {
  if (env().NODE_ENV === "production") {
    return new NextResponse(
      JSON.stringify({
        error: {
          code: "not_found",
          message: "Mock authorize is dev-only and disabled in production",
        },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const params = await routeContext.params;
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const redirectUri = url.searchParams.get("redirect_uri");
  if (!state || !redirectUri) {
    return new NextResponse(
      JSON.stringify({
        error: { code: "validation_error", message: "Missing state or redirect_uri" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Sanity check: the redirect URI we're about to bounce to must point at
  // our own /callback path for this provider. Defends against an attacker
  // crafting a /mock-authorize?redirect_uri=https://evil.example link.
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    return new NextResponse("invalid redirect_uri", { status: 400 });
  }
  const expected = new URL(env().APP_URL);
  if (redirect.host !== expected.host) {
    return new NextResponse("redirect_uri host does not match APP_URL", { status: 400 });
  }
  if (!redirect.pathname.endsWith(`/api/integrations/${params.provider}/callback`)) {
    return new NextResponse("redirect_uri path does not match this provider's callback", {
      status: 400,
    });
  }

  // Fabricate an authorization code; the mock adapter accepts anything
  // non-empty.
  redirect.searchParams.set("code", `mock_code_${Date.now()}`);
  redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect, { status: 302 });
}
