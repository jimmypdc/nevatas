import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  AUTH_TRUST_HOST: z.string().optional(),

  // Sliding session lifetime. maxAge is the absolute JWT expiry; NextAuth
  // re-mints on activity once updateAge has elapsed since the last mint.
  // The browser-side idle watcher triggers an explicit sign-out after
  // idleTimeoutMinutes of no user input, with a warning modal in the last
  // idleWarningSeconds before the deadline.
  SESSION_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(720).default(8),
  SESSION_UPDATE_AGE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(720).default(15),
  SESSION_IDLE_WARNING_SECONDS: z.coerce.number().int().min(5).max(300).default(30),

  DATABASE_URL: z.string().url(),

  FIELD_ENCRYPTION_KEY: z
    .string()
    .min(1, "FIELD_ENCRYPTION_KEY is required (32 random bytes, base64-encoded)"),

  // KMS driver. "env" uses FIELD_ENCRYPTION_KEY directly (dev/test only).
  // "aws" uses AWS KMS via the driver in lib/kms/aws.ts (production).
  KMS_DRIVER: z.enum(["env", "aws"]).default("env"),
  AWS_KMS_KEY_ID: z.string().optional(),

  // Secrets driver. "env" reads sensitive values from process.env (dev/test).
  // "aws" reads from AWS Secrets Manager via the driver in lib/secrets/aws.ts.
  SECRETS_DRIVER: z.enum(["env", "aws"]).default("env"),
  AWS_SECRETS_PREFIX: z.string().optional(),

  // Paycor integration driver. "mock" returns deterministic test data;
  // "live" calls the real Paycor API (requires PAYCOR_CLIENT_ID +
  // PAYCOR_CLIENT_SECRET + PAYCOR_API_BASE_URL — see
  // lib/integrations/paycor/live-adapter.ts for the wiring checklist).
  PAYCOR_DRIVER: z.enum(["mock", "live"]).default("mock"),
  PAYCOR_CLIENT_ID: z.string().optional(),
  PAYCOR_CLIENT_SECRET: z.string().optional(),
  PAYCOR_API_BASE_URL: z.string().url().optional(),
  PAYCOR_AUTH_BASE_URL: z.string().url().optional(),

  STORAGE_DRIVER: z.enum(["local", "s3", "r2"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/local"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
