// Request idempotency. Used by the apiHandler wrapper to dedup retried
// mutations.
//
// Contract:
//   - Client supplies an Idempotency-Key header on a mutating request. Keys
//     are typically UUIDs the client generates per business event.
//   - First request: server reserves the key with status="in_progress",
//     runs the handler, captures the response, marks "completed" with the
//     stored status code + body. The same response is returned on retry.
//   - Same key, same body, completed: replay the stored response.
//   - Same key, same body, in-progress: the original request is still
//     running; return 409 conflict (client should wait + retry, not
//     re-execute).
//   - Same key, different body: 422 — almost always a client bug.
//   - Expired (24h default): the key row is replaced; new execution proceeds.

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto/hashing";

const TTL_MS = 24 * 60 * 60_000;

export type ReserveResult =
  | { kind: "reserved"; rowId: string }
  | { kind: "replay"; response: Response }
  | { kind: "in_progress" }
  | { kind: "body_mismatch" };

export type ReserveInput = {
  scope: string;
  key: string;
  bodyHash: string;
  ttlMs?: number;
};

export async function reserveIdempotencyKey(input: ReserveInput): Promise<ReserveResult> {
  const ttl = input.ttlMs ?? TTL_MS;
  try {
    const row = await db.idempotencyKey.create({
      data: {
        scope: input.scope,
        key: input.key,
        bodyHash: input.bodyHash,
        status: "in_progress",
        expiresAt: new Date(Date.now() + ttl),
      },
    });
    return { kind: "reserved", rowId: row.id };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
      throw err;
    }
    // Unique violation: another request already claimed this (scope, key).
    const existing = await db.idempotencyKey.findUnique({
      where: { scope_key: { scope: input.scope, key: input.key } },
    });
    if (!existing) throw err; // shouldn't happen, but rethrow rather than silently lose

    // Expired entries are treated as if they don't exist. Delete + recurse.
    if (existing.expiresAt < new Date()) {
      await db.idempotencyKey
        .delete({ where: { id: existing.id } })
        .catch(() => undefined);
      return reserveIdempotencyKey(input);
    }

    if (existing.bodyHash !== input.bodyHash) {
      return { kind: "body_mismatch" };
    }
    if (existing.status === "in_progress") {
      return { kind: "in_progress" };
    }
    // Completed: replay.
    return {
      kind: "replay",
      response: rebuildResponse(existing),
    };
  }
}

// Captures the response from a successful (or failed) handler execution and
// stores it on the reserved row. Returns a fresh response (the original
// stream is consumed during capture).
export async function finalizeIdempotencyKey(
  rowId: string,
  response: Response,
): Promise<Response> {
  const bytes = Buffer.from(await response.arrayBuffer());
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headers[k] = v;
  });

  await db.idempotencyKey.update({
    where: { id: rowId },
    data: {
      status: "completed",
      statusCode: response.status,
      responseBodyB64: bytes.toString("base64"),
      responseHeadersJson: headers as Prisma.InputJsonValue,
    },
  });

  return new Response(new Uint8Array(bytes), {
    status: response.status,
    headers: response.headers,
  });
}

// Cleanup: if the handler crashed before finalize ran, leave the row in
// in_progress so the client gets 409 on retry until natural expiry. That's
// the safer default — re-running a partially-completed mutation can
// duplicate side effects.
export async function abandonIdempotencyKeyOnError(rowId: string): Promise<void> {
  // Intentionally a no-op for now: we rely on TTL expiry rather than
  // automatic cleanup so the operator has a chance to inspect what failed.
  void rowId;
}

function rebuildResponse(row: {
  statusCode: number | null;
  responseBodyB64: string | null;
  responseHeadersJson: Prisma.JsonValue | null;
}): Response {
  const status = row.statusCode ?? 200;
  const headers = new Headers();
  if (row.responseHeadersJson && typeof row.responseHeadersJson === "object") {
    for (const [k, v] of Object.entries(row.responseHeadersJson as Record<string, string>)) {
      headers.set(k, v);
    }
  }
  headers.set("x-idempotent-replay", "true");
  const body = row.responseBodyB64
    ? new Uint8Array(Buffer.from(row.responseBodyB64, "base64"))
    : null;
  return new Response(body, { status, headers });
}

// Helpers for the apiHandler integration.

export function computeBodyHash(rawBody: string): string {
  return sha256Hex(rawBody);
}

export function buildScope(params: { userId?: string; method: string; pathname: string }): string {
  // Anonymous-route scope falls back to a constant so retries from a
  // logged-out client still dedup. In practice no anonymous endpoint is
  // marked idempotent today, but the fallback keeps the contract honest.
  return `${params.userId ?? "anon"}:${params.method}:${params.pathname}`;
}
