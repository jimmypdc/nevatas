// Application-level encryption for highly sensitive fields (SSN, EIN, DOB,
// payroll provider tokens, bank/funding data).
//
// All NEW writes use envelope encryption (v2):
//   - A fresh 32-byte data encryption key (DEK) is generated per record.
//   - The plaintext is encrypted with the DEK using AES-256-GCM.
//   - The DEK itself is wrapped by the configured KMS driver (lib/kms/*).
//   - A serialized envelope is persisted: { kekId, wrappedDek, iv, ct, tag }.
//
// READS support both:
//   - v2: envelope decryption via the KMS driver registered for the kekId
//         carried inside the envelope. Allows KEK rotation without rewriting
//         every row at once.
//   - v1: legacy direct AES-256-GCM with FIELD_ENCRYPTION_KEY. Existing
//         pre-rotation rows decrypt; new writes never produce v1.
//
// Use reEncryptField() to migrate legacy v1 ciphertexts to v2 in a backfill.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";
import { driverForKekId, kms } from "@/lib/kms";

const IV_LEN = 12;
const TAG_LEN = 16;

// ---------- v1 (legacy direct env-key) ----------

let cachedV1Key: Buffer | null = null;
function v1Key(): Buffer {
  if (cachedV1Key) return cachedV1Key;
  const raw = Buffer.from(env().FIELD_ENCRYPTION_KEY, "base64");
  if (raw.length !== 32) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must decode to 32 bytes (got ${raw.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  cachedV1Key = raw;
  return cachedV1Key;
}

function v1Decrypt(blobBase64: string): string {
  const buf = Buffer.from(blobBase64, "base64");
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("v1 ciphertext too short");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", v1Key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// ---------- v2 (envelope) ----------

type EnvelopeV2 = {
  kekId: string;
  wrappedDek: string; // base64
  iv: string; // base64
  ct: string; // base64
  tag: string; // base64
};

async function v2Encrypt(plaintext: string): Promise<string> {
  const dek = randomBytes(32);
  try {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const driver = kms();
    const wrappedDek = await driver.wrapDek(dek);

    const envelope: EnvelopeV2 = {
      kekId: driver.activeKekId,
      wrappedDek: wrappedDek.toString("base64"),
      iv: iv.toString("base64"),
      ct: ct.toString("base64"),
      tag: tag.toString("base64"),
    };
    return `v2:${Buffer.from(JSON.stringify(envelope), "utf8").toString("base64")}`;
  } finally {
    // Best-effort wipe of the in-memory DEK. Node's GC will eventually
    // reclaim, but explicit zeroing narrows the window during which a
    // memory dump could expose it.
    dek.fill(0);
  }
}

async function v2Decrypt(blobBase64: string): Promise<string> {
  const json = Buffer.from(blobBase64, "base64").toString("utf8");
  let env: EnvelopeV2;
  try {
    env = JSON.parse(json);
  } catch {
    throw new Error("v2 envelope is not valid JSON");
  }
  if (!env.kekId || !env.wrappedDek || !env.iv || !env.ct || !env.tag) {
    throw new Error("v2 envelope is missing required fields");
  }

  const driver = driverForKekId(env.kekId);
  const dek = await driver.unwrapDek(Buffer.from(env.wrappedDek, "base64"), env.kekId);

  try {
    const iv = Buffer.from(env.iv, "base64");
    const ct = Buffer.from(env.ct, "base64");
    const tag = Buffer.from(env.tag, "base64");
    const decipher = createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

// ---------- Public API ----------

export async function encryptField(plaintext: string): Promise<string> {
  return v2Encrypt(plaintext);
}

export async function decryptField(payload: string): Promise<string> {
  const sep = payload.indexOf(":");
  if (sep < 0) throw new Error("Encrypted payload missing version prefix");
  const version = payload.slice(0, sep);
  const blob = payload.slice(sep + 1);
  switch (version) {
    case "v1":
      return v1Decrypt(blob);
    case "v2":
      return v2Decrypt(blob);
    default:
      throw new Error(`Unsupported encrypted payload version: ${version}`);
  }
}

export async function encryptOptional(value: string | null | undefined): Promise<string | null> {
  if (value == null || value === "") return null;
  return encryptField(value);
}

export async function decryptOptional(value: string | null | undefined): Promise<string | null> {
  if (value == null || value === "") return null;
  return decryptField(value);
}

// Migration helper: takes a v1 ciphertext and re-encrypts it as v2 under the
// active KMS driver. Used by a future backfill job to retire the env-key
// fallback in production.
export async function reEncryptField(payload: string): Promise<string> {
  const plaintext = await decryptField(payload);
  return v2Encrypt(plaintext);
}

// Stable last-4 digits helper for SSN. Strips non-digits before slicing.
export function ssnLast4(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  return digits.slice(-4);
}

// Test-only: flush v1 key cache so tests can swap FIELD_ENCRYPTION_KEY.
export function _resetV1KeyCache(): void {
  cachedV1Key = null;
}
