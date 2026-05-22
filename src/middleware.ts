// Edge middleware. Two duties:
//
//   1) CSRF defense for state-changing requests
//      - Reject non-GET/HEAD/OPTIONS requests whose Origin (or Referer fallback)
//        does not match APP_URL. NextAuth cookies are SameSite=Lax which
//        already provides primary CSRF protection for top-level navigations;
//        this adds a second layer for fetch/XHR requests.
//
//   2) Per-IP rate limiting on:
//      - /api/auth/* (slows credential stuffing / brute force)
//      - /api/files/upload (caps abuse of the heaviest endpoint)
//      - All other /api/* mutations (general flood ceiling)
//
// We attach a request ID on every request so logs and audit events correlate.

import { NextResponse, type NextRequest } from "next/server";

import { RL_POLICIES, rateLimiter } from "@/lib/rate-limit";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Paths under /api/auth/* are managed by NextAuth which has its own CSRF
// protection (signed state token). We still rate-limit them.
const NEXTAUTH_PATH = /^\/api\/auth(\/|$)/;

export const config = {
  // Run on /api routes plus app pages, but not static assets / next internals.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  // ---- CSRF: origin verification on state-changing methods ----
  // Accept the request when Origin (or Referer fallback) matches EITHER the
  // configured APP_URL or the request's own host. APP_URL alone is too
  // strict in dev (localhost vs 127.0.0.1, port mismatches, ngrok tunnels)
  // and the request-host check is the actual CSRF invariant: an attacker
  // can't forge an Origin header to match our domain.
  if (!SAFE_METHODS.has(req.method)) {
    const acceptable = acceptableOrigins(req);
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    if (!matchesAnyOrigin(acceptable, origin, referer)) {
      return jsonError(403, "forbidden", "Cross-origin request denied", requestId);
    }
  }

  // ---- Rate limit ----
  const ip = clientIp(req) ?? "unknown";
  let policy: { max: number; windowMs: number } | null = null;

  if (NEXTAUTH_PATH.test(url.pathname) && req.method === "POST") {
    policy = { ...RL_POLICIES.authPost };
  } else if (url.pathname === "/api/files/upload" && req.method === "POST") {
    policy = { ...RL_POLICIES.fileUpload };
  } else if (url.pathname.startsWith("/api/") && !SAFE_METHODS.has(req.method)) {
    policy = { ...RL_POLICIES.apiMutation };
  }

  if (policy) {
    const key = `${url.pathname}:${ip}`;
    const r = await rateLimiter.check(key, policy);
    if (!r.allowed) {
      const res = jsonError(429, "rate_limited", "Too many requests", requestId);
      res.headers.set("Retry-After", Math.ceil((r.resetAt - Date.now()) / 1000).toString());
      res.headers.set("X-RateLimit-Limit", r.limit.toString());
      res.headers.set("X-RateLimit-Remaining", "0");
      res.headers.set("X-RateLimit-Reset", Math.ceil(r.resetAt / 1000).toString());
      return res;
    }
  }

  // Forward the pathname as a request header so server layouts can read
  // it (Next.js doesn't expose the current URL inside a layout otherwise).
  // The app layout uses this to detect when it's rendering the
  // /app/acknowledge gate page and self-exempt from the redirect loop.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", url.pathname);
  requestHeaders.set("x-request-id", requestId);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-request-id", requestId);
  return res;
}

function acceptableOrigins(req: NextRequest): string[] {
  const out: string[] = [];
  const env = process.env.APP_URL;
  if (env) out.push(env.replace(/\/+$/, ""));
  // Always accept the request's own host. The CSRF invariant is "Origin
  // matches request host"; an attacker can't forge Origin to match.
  out.push(`${req.nextUrl.protocol}//${req.nextUrl.host}`);
  // Some proxies pass the original host in x-forwarded-host. Accept that
  // too when it differs from req.nextUrl.host.
  const fwdHost = req.headers.get("x-forwarded-host");
  const fwdProto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  if (fwdHost && fwdHost !== req.nextUrl.host) {
    out.push(`${fwdProto}://${fwdHost}`);
  }
  return out;
}

function matchesAnyOrigin(
  acceptable: string[],
  origin: string | null,
  referer: string | null,
): boolean {
  const normalized = acceptable.map((a) => a.replace(/\/+$/, ""));
  if (origin) {
    if (origin === "null") return false;
    return normalized.includes(origin.replace(/\/+$/, ""));
  }
  // Some browsers omit Origin on same-origin POSTs. Fall back to Referer.
  if (referer) {
    try {
      const r = new URL(referer);
      const refOrigin = `${r.protocol}//${r.host}`;
      return normalized.includes(refOrigin);
    } catch {
      return false;
    }
  }
  // No Origin and no Referer on a non-safe method — reject.
  return false;
}

function clientIp(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

function jsonError(status: number, code: string, message: string, requestId: string): NextResponse {
  const res = NextResponse.json(
    { error: { code, message, requestId } },
    { status },
  );
  res.headers.set("x-request-id", requestId);
  return res;
}
