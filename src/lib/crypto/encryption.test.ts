import { createCipheriv, randomBytes } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("field encryption", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "x".repeat(32);
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://placeholder/db";
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.KMS_DRIVER = "env";
  });

  beforeEach(async () => {
    // Reset module-level caches between tests so a key swap inside a test
    // doesn't leak into the next.
    const enc = await import("@/lib/crypto/encryption");
    const kms = await import("@/lib/kms");
    const envKey = await import("@/lib/kms/env-key");
    enc._resetV1KeyCache();
    kms._resetKmsForTests();
    envKey._resetEnvKekCache();
  });

  it("v2 envelope encryption round-trips a plaintext", async () => {
    const { encryptField, decryptField } = await import("@/lib/crypto/encryption");
    const ct = await encryptField("123-45-6789");
    expect(ct).toMatch(/^v2:/);
    expect(await decryptField(ct)).toBe("123-45-6789");
  });

  it("produces a different ciphertext per call (random DEK + IV)", async () => {
    const { encryptField } = await import("@/lib/crypto/encryption");
    const a = await encryptField("hello");
    const b = await encryptField("hello");
    expect(a).not.toBe(b);
  });

  it("rejects tampered v2 ciphertext", async () => {
    const { encryptField, decryptField } = await import("@/lib/crypto/encryption");
    const ct = await encryptField("hello");
    // Decode envelope, flip a byte in the ciphertext, re-encode.
    const blob = ct.slice("v2:".length);
    const json = JSON.parse(Buffer.from(blob, "base64").toString("utf8"));
    const ctBytes = Buffer.from(json.ct, "base64");
    ctBytes[0] = (ctBytes[0] ?? 0) ^ 0x01;
    json.ct = ctBytes.toString("base64");
    const tampered = `v2:${Buffer.from(JSON.stringify(json), "utf8").toString("base64")}`;
    await expect(decryptField(tampered)).rejects.toThrow();
  });

  it("rejects v2 envelope with an unknown kekId", async () => {
    const { decryptField } = await import("@/lib/crypto/encryption");
    const fake = {
      kekId: "env:rotated-out",
      wrappedDek: Buffer.from("xx").toString("base64"),
      iv: Buffer.from(new Uint8Array(12)).toString("base64"),
      ct: Buffer.from("yy").toString("base64"),
      tag: Buffer.from(new Uint8Array(16)).toString("base64"),
    };
    const blob = `v2:${Buffer.from(JSON.stringify(fake), "utf8").toString("base64")}`;
    await expect(decryptField(blob)).rejects.toThrow();
  });

  it("decrypts legacy v1 ciphertext (back-compat)", async () => {
    const { decryptField } = await import("@/lib/crypto/encryption");
    // Reproduce the v1 layout: "v1:" + base64(iv || ct || tag) under the
    // current FIELD_ENCRYPTION_KEY.
    const key = Buffer.from(process.env.FIELD_ENCRYPTION_KEY!, "base64");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update("legacy-secret", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const v1 = `v1:${Buffer.concat([iv, ct, tag]).toString("base64")}`;
    expect(await decryptField(v1)).toBe("legacy-secret");
  });

  it("reEncryptField migrates v1 ciphertext to v2", async () => {
    const { reEncryptField, decryptField } = await import("@/lib/crypto/encryption");
    const key = Buffer.from(process.env.FIELD_ENCRYPTION_KEY!, "base64");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update("legacy-secret", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const v1 = `v1:${Buffer.concat([iv, ct, tag]).toString("base64")}`;

    const v2 = await reEncryptField(v1);
    expect(v2).toMatch(/^v2:/);
    expect(await decryptField(v2)).toBe("legacy-secret");
  });

  it("ssnLast4 strips non-digits and slices last 4", async () => {
    const { ssnLast4 } = await import("@/lib/crypto/encryption");
    expect(ssnLast4("123-45-6789")).toBe("6789");
    expect(ssnLast4("xxx00 1234")).toBe("1234");
  });
});
