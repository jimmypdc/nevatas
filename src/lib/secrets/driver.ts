// Secrets driver interface. The application asks for sensitive values by
// stable logical name (e.g. "AUTH_SECRET", "DATABASE_URL", "FIELD_ENCRYPTION_KEY").
// In dev the env driver looks them up in process.env. In production an
// operator-managed secrets store (AWS Secrets Manager, Doppler, HashiCorp
// Vault, Akeyless, GCP Secret Manager) holds the canonical values; the
// application fetches them at boot or lazily on first use.
//
// Why a logical name? The store may use a key like
//   "/nevatas/prod/auth/AUTH_SECRET"
// while the application asks for the unqualified "AUTH_SECRET". The driver
// applies the prefix; call sites stay portable across environments.
//
// Caching contract: implementations cache values with a TTL so rotation
// surfaces within minutes without a redeploy. invalidate() forces an
// immediate refresh when the operator has reason to believe a secret has
// rotated outside the normal window.

export interface SecretsDriver {
  readonly name: "env" | "aws";

  getSecret(logicalName: string): Promise<string>;
  invalidate(logicalName: string): void;
}

// Names that the application asks for via the driver. Centralizing them here
// means a secrets-store admin can pre-create exactly these entries with the
// matching string keys and no surprises at runtime.
export const SECRET_NAMES = {
  authSecret: "AUTH_SECRET",
  fieldEncryptionKey: "FIELD_ENCRYPTION_KEY",
  databaseUrl: "DATABASE_URL",
  s3AccessKeyId: "S3_ACCESS_KEY_ID",
  s3SecretAccessKey: "S3_SECRET_ACCESS_KEY",
  awsKmsKeyId: "AWS_KMS_KEY_ID",
} as const;

export type SecretName = (typeof SECRET_NAMES)[keyof typeof SECRET_NAMES];
