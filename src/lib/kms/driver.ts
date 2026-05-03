// KMS driver interface for envelope encryption.
//
// The application generates a fresh data encryption key (DEK) per ciphertext
// using AES-256-GCM. The driver's job is to "wrap" that DEK with the master
// key (KEK) — for production this is an HSM-backed key in AWS KMS / GCP KMS
// / Azure Key Vault; the master key never leaves the KMS boundary.
//
// To decrypt a stored value the application retrieves the wrapped DEK from
// the envelope and asks the driver to unwrap it. KMS-side audit logs
// (CloudTrail / Stackdriver / Activity Log) capture every unwrap call,
// providing SOC 2 evidence that decryption attempts were authorized.
//
// kekId is opaque to callers. It's persisted alongside the wrapped DEK so
// that, after a key rotation, the system can route to the right KEK to
// unwrap legacy ciphertexts without rewriting them.

export interface KmsDriver {
  // Stable identifier for the active KEK. In production this is the KMS key
  // ARN/URI; in dev with the env-key driver it is "env:v1".
  readonly activeKekId: string;
  readonly name: "env" | "aws";

  wrapDek(dek: Buffer): Promise<Buffer>;
  unwrapDek(wrappedDek: Buffer, kekId: string): Promise<Buffer>;
}
