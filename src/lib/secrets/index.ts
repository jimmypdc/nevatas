// Secrets driver selection.
//
// Process-wide singleton chosen by the SECRETS_DRIVER env var. Defaults to
// the env driver (dev/test). Production deploys must set SECRETS_DRIVER=aws.
//
// Two ways to consume secrets in application code:
//
//   1. Direct: `await getSecret(SECRET_NAMES.authSecret)` — preferred for new
//      code paths. Hits the cache, transparent rotation.
//
//   2. Boot bridge: call `loadSecretsIntoEnv(...)` once at startup to copy
//      the named secrets into process.env. This keeps the existing
//      sync `env()` accessor working unchanged for the rest of the codebase.
//      Suitable for the time before every call site has been migrated to
//      direct fetch.

import { AwsSecretsManagerDriver } from "@/lib/secrets/aws";
import type { SecretsDriver, SecretName } from "@/lib/secrets/driver";
import { EnvSecretsDriver } from "@/lib/secrets/env";

let activeDriver: SecretsDriver | null = null;

function build(): SecretsDriver {
  const driver = process.env.SECRETS_DRIVER ?? "env";
  switch (driver) {
    case "env":
      return new EnvSecretsDriver();
    case "aws":
      return new AwsSecretsManagerDriver();
    default:
      throw new Error(`Unknown SECRETS_DRIVER=${driver}; expected "env" or "aws"`);
  }
}

export function secrets(): SecretsDriver {
  if (!activeDriver) activeDriver = build();
  return activeDriver;
}

export async function getSecret(name: SecretName | string): Promise<string> {
  return secrets().getSecret(name);
}

// Boot-time bridge: fetches each named secret and writes it to process.env
// (only if it isn't already set, so explicit env vars in dev still win).
// Call this from a server entrypoint before any code reads env(). Returns
// the list of names that were actually populated by the driver.
export async function loadSecretsIntoEnv(names: readonly string[]): Promise<string[]> {
  const driver = secrets();
  const populated: string[] = [];
  for (const name of names) {
    if (process.env[name]) continue;
    try {
      const value = await driver.getSecret(name);
      process.env[name] = value;
      populated.push(name);
    } catch {
      // The env driver will throw for missing secrets; that's fine — leave
      // it unset and let env validation fail downstream with a clear error.
      // The aws driver may throw for connectivity issues; we want those to
      // bubble.
      if (driver.name === "aws") throw new Error(`Failed to load secret ${name} from AWS Secrets Manager`);
    }
  }
  return populated;
}

// Test-only — flush the singleton.
export function _resetSecretsForTests(): void {
  activeDriver = null;
}

export { SECRET_NAMES } from "@/lib/secrets/driver";
export type { SecretsDriver, SecretName } from "@/lib/secrets/driver";
