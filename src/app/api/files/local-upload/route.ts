// Dev-only: receives the body that the local driver's signed upload URL points
// at. Verifies the HMAC token over (key, expiresAt, sha256, sizeBytes,
// contentType) and writes the bytes to disk. NEVER mounted in production —
// the route refuses when STORAGE_DRIVER !== "local".

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { LocalStorageDriverInternal, verifyLocalToken } from "@/lib/storage/local-driver";

export async function PUT(req: NextRequest): Promise<Response> {
  if (env().STORAGE_DRIVER !== "local") {
    return jsonError(404, "not_found", "Route is only available when STORAGE_DRIVER=local");
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const expRaw = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  if (!key || !expRaw || !sig) {
    return jsonError(400, "validation_error", "Missing key, exp, or sig query params");
  }
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt)) {
    return jsonError(400, "validation_error", "exp must be numeric");
  }

  const contentType = req.headers.get("content-type") ?? "";
  const contentLengthHeader = req.headers.get("content-length");
  const claimedSha = req.headers.get("x-nevatas-sha256") ?? "";
  if (!contentLengthHeader || !claimedSha) {
    return jsonError(400, "validation_error", "Content-Length and x-nevatas-sha256 headers are required");
  }
  const sizeBytes = Number(contentLengthHeader);

  const ok = verifyLocalToken(
    {
      intent: "upload",
      key,
      expiresAt,
      sha256Hex: claimedSha,
      sizeBytes,
      contentType,
    },
    sig,
  );
  if (!ok) {
    return jsonError(403, "forbidden", "Signed URL is invalid, expired, or tampered with");
  }

  const arrayBuf = await req.arrayBuffer();
  const bytes = Buffer.from(arrayBuf);
  if (bytes.length !== sizeBytes) {
    return jsonError(400, "validation_error", "Content-Length does not match body size");
  }
  const computed = createHash("sha256").update(bytes).digest("hex");
  if (computed !== claimedSha) {
    return jsonError(400, "validation_error", "SHA-256 of body does not match the claimed checksum");
  }

  await LocalStorageDriverInternal.writeBytes(key, bytes);
  return NextResponse.json({ ok: true, key, sizeBytes, sha256Hex: computed });
}

function jsonError(status: number, code: string, message: string): Response {
  return NextResponse.json({ error: { code, message } }, { status });
}
