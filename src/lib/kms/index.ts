// KMS driver selection.
//
// Process-wide singleton chosen by the KMS_DRIVER env var. The driver is used
// for envelope encryption (see crypto/encryption.ts).
//
// To support legacy ciphertexts encrypted under a previous KEK during a
// rotation window, we keep an array of "decrypt-only" drivers indexed by
// kekId. Today only the active driver is registered — the registry exists
// so a future rotation migration can register the legacy driver here without
// changing call sites.

import { env } from "@/lib/env";
import { AwsKmsDriver } from "@/lib/kms/aws";
import type { KmsDriver } from "@/lib/kms/driver";
import { EnvKeyKmsDriver } from "@/lib/kms/env-key";

let activeDriver: KmsDriver | null = null;
const decryptOnlyDrivers = new Map<string, KmsDriver>();

function build(): KmsDriver {
  const driver = env().KMS_DRIVER;
  switch (driver) {
    case "env":
      return new EnvKeyKmsDriver();
    case "aws":
      return new AwsKmsDriver();
  }
}

export function kms(): KmsDriver {
  if (!activeDriver) {
    activeDriver = build();
    decryptOnlyDrivers.set(activeDriver.activeKekId, activeDriver);
  }
  return activeDriver;
}

// Returns a driver that can unwrap a DEK wrapped under the supplied kekId.
// Falls back to the active driver (which will throw if it can't handle it).
// Future use: during a rotation, the operator constructs a legacy driver and
// calls registerLegacyDriver() to make it available here.
export function driverForKekId(kekId: string): KmsDriver {
  const found = decryptOnlyDrivers.get(kekId);
  if (found) return found;
  return kms();
}

export function registerLegacyDriver(driver: KmsDriver): void {
  decryptOnlyDrivers.set(driver.activeKekId, driver);
}

// Test-only — flush the singleton + registry.
export function _resetKmsForTests(): void {
  activeDriver = null;
  decryptOnlyDrivers.clear();
}

export type { KmsDriver } from "@/lib/kms/driver";
