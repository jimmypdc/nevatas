// Dev-only filesystem driver. Stores files on disk under STORAGE_LOCAL_DIR.
// Mimics the production S3/R2 contract — including presigned upload — so the
// upload UI exercises the same two-phase flow in dev as in production.
//
// Path traversal is rejected. The signed-upload + signed-download URLs carry
// an HMAC-signed token over (key, intent, expiresAt) so the dev routes that
// receive them can verify the URL came from this process.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { env } from "@/lib/env";
import type {
  HeadObjectResult,
  PutObjectInput,
  SignedDownloadInput,
  SignedUploadInput,
  SignedUploadResult,
  StorageDriver,
} from "@/lib/storage/driver";

const DEFAULT_DOWNLOAD_EXPIRES_S = 5 * 60;
const DEFAULT_UPLOAD_EXPIRES_S = 10 * 60;

export class LocalStorageDriver implements StorageDriver {
  readonly name = "local" as const;

  private root(): string {
    return resolve(env().STORAGE_LOCAL_DIR);
  }

  private resolveSafe(key: string): string {
    if (key.includes("..") || key.startsWith("/") || key.startsWith("\\")) {
      throw new Error(`Refusing unsafe storage key: ${key}`);
    }
    return join(this.root(), key);
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const path = this.resolveSafe(input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body);
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.resolveSafe(key));
  }

  async signedUploadUrl(input: SignedUploadInput): Promise<SignedUploadResult> {
    const expiresIn = input.expiresInSeconds ?? DEFAULT_UPLOAD_EXPIRES_S;
    const expiresAt = Date.now() + expiresIn * 1000;
    const token = signLocalToken({
      intent: "upload",
      key: input.key,
      expiresAt,
      sha256Hex: input.sha256Hex,
      sizeBytes: input.sizeBytes,
      contentType: input.contentType,
    });
    const params = new URLSearchParams({
      key: input.key,
      exp: String(expiresAt),
      sig: token,
    });
    return {
      uploadUrl: `/api/files/local-upload?${params.toString()}`,
      method: "PUT",
      requiredHeaders: {
        "Content-Type": input.contentType,
        "Content-Length": String(input.sizeBytes),
        // Used by the dev route to verify the body matches what was signed.
        "x-nevatas-sha256": input.sha256Hex,
      },
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async signedDownloadUrl(input: SignedDownloadInput): Promise<string> {
    const expiresIn = input.expiresInSeconds ?? DEFAULT_DOWNLOAD_EXPIRES_S;
    const expiresAt = Date.now() + expiresIn * 1000;
    const token = signLocalToken({ intent: "download", key: input.key, expiresAt });
    const params = new URLSearchParams({
      key: input.key,
      exp: String(expiresAt),
      sig: token,
    });
    return `/api/files/local-download?${params.toString()}`;
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    const path = this.resolveSafe(key);
    const s = await stat(path);
    if (!s.isFile()) throw new Error(`Storage key ${key} is not a regular file`);
    // Compute sha256 once on access. For dev only — production S3 returns
    // the verified checksum via x-amz-checksum-sha256 without re-reading.
    const bytes = await readFile(path);
    const sha256Hex = createHash("sha256").update(bytes).digest("hex");
    return { sizeBytes: s.size, sha256Hex };
  }
}

// ---------- HMAC-signed local URL tokens ----------

type LocalTokenPayload = {
  intent: "upload" | "download";
  key: string;
  expiresAt: number;
  sha256Hex?: string;
  sizeBytes?: number;
  contentType?: string;
};

function tokenSecret(): Buffer {
  // Reuse FIELD_ENCRYPTION_KEY's bytes as the HMAC key. The token only
  // protects dev-mode storage URLs; production never sees these tokens.
  return Buffer.from(env().FIELD_ENCRYPTION_KEY, "base64");
}

export function signLocalToken(payload: LocalTokenPayload): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHmac("sha256", tokenSecret()).update(canonical).digest("base64url");
}

export function verifyLocalToken(
  expected: LocalTokenPayload,
  suppliedToken: string,
): boolean {
  if (Date.now() > expected.expiresAt) return false;
  const want = signLocalToken(expected);
  const a = Buffer.from(want);
  const b = Buffer.from(suppliedToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class LocalStorageDriverInternal {
  // Re-exported helpers so dev API routes can resolve a key + verify HMAC
  // without importing the driver-private bits directly.
  static resolvePath(key: string): string {
    if (key.includes("..") || key.startsWith("/") || key.startsWith("\\")) {
      throw new Error(`Refusing unsafe storage key: ${key}`);
    }
    return join(resolve(env().STORAGE_LOCAL_DIR), key);
  }
  static async writeBytes(key: string, bytes: Buffer): Promise<void> {
    const path = this.resolvePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
}
