// Unified API route helper.
// - Captures request ID for audit correlation
// - Converts AppError into safe JSON
// - Hides internals on unexpected errors
// - Validates body with Zod when a schema is supplied
// - Optional Stripe-style idempotency: when options.idempotent is true and
//   the client supplies an Idempotency-Key header, the wrapper reserves the
//   key and replays the stored response on retry.

import { NextResponse, type NextRequest } from "next/server";
import type { ZodSchema } from "zod";

import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  buildScope,
  computeBodyHash,
  finalizeIdempotencyKey,
  reserveIdempotencyKey,
} from "@/lib/api/idempotency";
import { getRequestContext } from "@/lib/request-context";

export type ApiHandlerArgs<TBody, TParams> = {
  req: NextRequest;
  body: TBody;
  params: TParams;
  ctx: Awaited<ReturnType<typeof getRequestContext>>;
};

export type ApiHandlerOptions<TBody, TParams> = {
  bodySchema?: ZodSchema<TBody>;
  paramsSchema?: ZodSchema<TParams>;
  // Enables Idempotency-Key handling. Only meaningful on mutating methods
  // (POST/PUT/PATCH/DELETE). Routes that opt in can rely on the wrapper to
  // reject mismatched-body retries (422), in-flight retries (409), and to
  // replay completed responses on retry.
  idempotent?: boolean;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function apiHandler<TBody = undefined, TParams = undefined>(
  options: ApiHandlerOptions<TBody, TParams>,
  handler: (args: ApiHandlerArgs<TBody, TParams>) => Promise<NextResponse | Response>,
) {
  return async (
    req: NextRequest,
    routeContext: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const ctx = await getRequestContext();
    try {
      // Read the raw body once so both Zod validation and idempotency
      // hashing see the same bytes. Empty for GET/HEAD/OPTIONS and for
      // multipart routes (which never set bodySchema).
      let rawBody = "";
      let parsedJson: unknown = undefined;
      if (!SAFE_METHODS.has(req.method) && options.bodySchema) {
        rawBody = await req.text().catch(() => "");
        if (rawBody) {
          try {
            parsedJson = JSON.parse(rawBody);
          } catch {
            return jsonError(
              422,
              "validation_error",
              "Request body is not valid JSON",
              undefined,
              ctx.requestId,
            );
          }
        } else {
          parsedJson = {};
        }
      }

      // ---- Idempotency precheck ----
      let idemRowId: string | null = null;
      if (options.idempotent && !SAFE_METHODS.has(req.method)) {
        const key = req.headers.get("idempotency-key")?.trim();
        if (key) {
          if (key.length < 8 || key.length > 256) {
            return jsonError(
              422,
              "validation_error",
              "Idempotency-Key must be 8–256 characters",
              undefined,
              ctx.requestId,
            );
          }
          const session = await auth().catch(() => null);
          const url = new URL(req.url);
          const scope = buildScope({
            userId: session?.user?.id,
            method: req.method,
            pathname: url.pathname,
          });
          const reservation = await reserveIdempotencyKey({
            scope,
            key,
            bodyHash: computeBodyHash(rawBody),
          });
          if (reservation.kind === "replay") {
            // Stamp request id on the replayed response for log correlation.
            reservation.response.headers.set("x-request-id", ctx.requestId);
            return reservation.response;
          }
          if (reservation.kind === "in_progress") {
            return jsonError(
              409,
              "conflict",
              "A request with this Idempotency-Key is currently in flight; retry shortly",
              undefined,
              ctx.requestId,
            );
          }
          if (reservation.kind === "body_mismatch") {
            return jsonError(
              422,
              "validation_error",
              "Idempotency-Key already used with a different request body",
              undefined,
              ctx.requestId,
            );
          }
          idemRowId = reservation.rowId;
        }
      }

      let body = undefined as TBody;
      if (options.bodySchema) {
        const parsed = options.bodySchema.safeParse(parsedJson ?? {});
        if (!parsed.success) {
          return jsonError(422, "validation_error", "Invalid request body", parsed.error.flatten(), ctx.requestId);
        }
        body = parsed.data as TBody;
      }

      let params = undefined as TParams;
      if (options.paramsSchema) {
        const rawParams = await routeContext.params;
        const parsed = options.paramsSchema.safeParse(rawParams);
        if (!parsed.success) {
          return jsonError(422, "validation_error", "Invalid route params", parsed.error.flatten(), ctx.requestId);
        }
        params = parsed.data as TParams;
      }

      const response = await handler({ req, body, params, ctx });
      response.headers.set("x-request-id", ctx.requestId);

      // Capture + store response for future replay. The original stream has
      // been consumed; finalize returns a fresh response with identical
      // bytes/headers/status.
      if (idemRowId) {
        const captured = await finalizeIdempotencyKey(idemRowId, response);
        captured.headers.set("x-request-id", ctx.requestId);
        return captured;
      }
      return response;
    } catch (err) {
      if (err instanceof AppError) {
        return jsonError(err.status, err.code, err.message, err.details, ctx.requestId);
      }
      // Unknown error — log server-side, return generic to client.
      console.error("[api]", { requestId: ctx.requestId, err });
      return jsonError(500, "internal_error", "An unexpected error occurred", undefined, ctx.requestId);
    }
  };
}

function jsonError(
  status: number,
  code: string,
  message: string,
  details: unknown,
  requestId: string,
): NextResponse {
  const res = NextResponse.json(
    { error: { code, message, details: details ?? undefined, requestId } },
    { status },
  );
  res.headers.set("x-request-id", requestId);
  return res;
}
