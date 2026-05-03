// Dev-only: serves bytes for the local driver's signed download URL after
// verifying the HMAC token. Production uses S3/R2 presigned GETs that don't
// route through the app at all.

import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { LocalStorageDriverInternal, verifyLocalToken } from "@/lib/storage/local-driver";

export async function GET(req: NextRequest): Promise<Response> {
  if (env().STORAGE_DRIVER !== "local") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Route is only available when STORAGE_DRIVER=local" } },
      { status: 404 },
    );
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const expRaw = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  if (!key || !expRaw || !sig) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Missing key, exp, or sig query params" } },
      { status: 400 },
    );
  }
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt)) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "exp must be numeric" } },
      { status: 400 },
    );
  }

  const ok = verifyLocalToken({ intent: "download", key, expiresAt }, sig);
  if (!ok) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Signed URL is invalid or expired" } },
      { status: 403 },
    );
  }

  const { readFile } = await import("node:fs/promises");
  const path = LocalStorageDriverInternal.resolvePath(key);
  const bytes = await readFile(path).catch(() => null);
  if (!bytes) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Object not found" } },
      { status: 404 },
    );
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
  });
}
