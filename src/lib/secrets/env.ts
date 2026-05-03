// Env-backed secrets driver. Reads from process.env. Dev/test only — the
// existing .env / OS-environment workflow is unchanged when SECRETS_DRIVER=env.
//
// In production, prefer SECRETS_DRIVER=aws + the AWS driver in lib/secrets/aws.ts
// so secrets never live in plaintext on disk and access is audited.

import type { SecretsDriver } from "@/lib/secrets/driver";

export class EnvSecretsDriver implements SecretsDriver {
  readonly name = "env" as const;

  async getSecret(logicalName: string): Promise<string> {
    const value = process.env[logicalName];
    if (value === undefined || value === "") {
      throw new Error(
        `Secret "${logicalName}" is not set in the environment. Add it to .env or your hosting provider's secret store.`,
      );
    }
    return value;
  }

  invalidate(_logicalName: string): void {
    // No-op: process.env is the source of truth and changes at runtime
    // require a process restart anyway.
  }
}
