// AWS Secrets Manager driver. Stubbed — selecting SECRETS_DRIVER=aws will
// throw at first secret fetch with a pointer to this file so the operator
// wires it before going to production.
//
// Wiring checklist when ready:
//
//   1. npm install @aws-sdk/client-secrets-manager
//
//   2. Create one secret per name in SECRET_NAMES (lib/secrets/driver.ts),
//      e.g. /nevatas/prod/AUTH_SECRET. Use a per-environment prefix so dev,
//      staging, and prod stay isolated. Set AWS_SECRETS_PREFIX accordingly.
//
//   3. Restrict each secret's resource policy to:
//        - the application's IAM role (secretsmanager:GetSecretValue)
//        - the security/operations role for break-glass (full CRUD)
//        - DENY everyone else, including root, except via policy update
//      Enable rotation where appropriate (Secrets Manager supports
//      Lambda-driven rotation for credentials).
//
//   4. Set SECRETS_DRIVER=aws and AWS_SECRETS_PREFIX in the deployment
//      environment. AWS_REGION must also resolve (via the SDK's standard
//      chain — env, EC2 instance metadata, ECS task role, etc.).
//
//   5. Replace the body of getSecret() below with the AWS SDK call noted
//      inline. Verify in a non-prod environment first.
//
//   6. Once stable, remove FIELD_ENCRYPTION_KEY and other plaintext secrets
//      from .env / .env.production / GitHub Actions / hosting provider env.
//      The .env.example entries remain as documentation only.

import type { SecretsDriver } from "@/lib/secrets/driver";

type CacheEntry = { value: string; expiresAt: number };

const TTL_MS = 5 * 60_000;

export class AwsSecretsManagerDriver implements SecretsDriver {
  readonly name = "aws" as const;
  private readonly prefix: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor() {
    this.prefix = (process.env.AWS_SECRETS_PREFIX ?? "").replace(/\/+$/, "");
    if (!this.prefix) {
      throw new Error("AWS_SECRETS_PREFIX must be set when SECRETS_DRIVER=aws");
    }
  }

  async getSecret(logicalName: string): Promise<string> {
    const cached = this.cache.get(logicalName);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const _fullName = `${this.prefix}/${logicalName}`;

    // Production implementation:
    //
    //   const client = new SecretsManagerClient({});
    //   const result = await client.send(new GetSecretValueCommand({
    //     SecretId: _fullName,
    //   }));
    //   const value = result.SecretString
    //     ?? Buffer.from(result.SecretBinary!).toString("utf8");
    //   if (!value) throw new Error(`Secret ${_fullName} has no value`);
    //   this.cache.set(logicalName, { value, expiresAt: Date.now() + TTL_MS });
    //   return value;
    throw new Error(
      "AwsSecretsManagerDriver.getSecret is not implemented. See lib/secrets/aws.ts for the wiring checklist.",
    );
  }

  invalidate(logicalName: string): void {
    this.cache.delete(logicalName);
  }
}

// Re-export the TTL so tests / call sites can reason about freshness.
export const AWS_SECRETS_TTL_MS = TTL_MS;
