// Env-key KMS driver. The "KEK" is the FIELD_ENCRYPTION_KEY env var. Used in
// dev/test only — production must use a managed key service (see
// AwsKmsDriver). Offered here so the same envelope encryption code path
// works identically in dev and prod, just with different driver wiring.
//
// Wrapping algorithm: AES-256-GCM with a fresh random IV per wrap. Output
// layout: iv (12 bytes) || ciphertext || authTag (16 bytes).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";
import type { KmsDriver } from "@/lib/kms/driver";

const KEK_ID = "env:v1";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function loadKek(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = Buffer.from(env().FIELD_ENCRYPTION_KEY, "base64");
  if (raw.length !== 32) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must decode to 32 bytes (got ${raw.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  cachedKey = raw;
  return cachedKey;
}

export class EnvKeyKmsDriver implements KmsDriver {
  readonly name = "env" as const;
  readonly activeKekId = KEK_ID;

  async wrapDek(dek: Buffer): Promise<Buffer> {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", loadKek(), iv);
    const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ct, tag]);
  }

  async unwrapDek(wrappedDek: Buffer, kekId: string): Promise<Buffer> {
    if (kekId !== KEK_ID) {
      throw new Error(`EnvKeyKmsDriver cannot unwrap kekId=${kekId}; expected ${KEK_ID}`);
    }
    if (wrappedDek.length < IV_LEN + TAG_LEN) {
      throw new Error("wrapped DEK too short");
    }
    const iv = wrappedDek.subarray(0, IV_LEN);
    const tag = wrappedDek.subarray(wrappedDek.length - TAG_LEN);
    const ct = wrappedDek.subarray(IV_LEN, wrappedDek.length - TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", loadKek(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

// Test-only helper to flush the cached key so tests can swap
// FIELD_ENCRYPTION_KEY between cases.
export function _resetEnvKekCache(): void {
  cachedKey = null;
}
