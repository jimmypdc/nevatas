import { env } from "@/lib/env";
import { LocalStorageDriver } from "@/lib/storage/local-driver";
import { S3StorageDriver } from "@/lib/storage/s3-driver";
import type { StorageDriver } from "@/lib/storage/driver";

let cached: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (cached) return cached;
  const driver = env().STORAGE_DRIVER;
  switch (driver) {
    case "local":
      cached = new LocalStorageDriver();
      return cached;
    case "s3":
    case "r2":
      cached = new S3StorageDriver(driver);
      return cached;
  }
}

// Test-only — flush the singleton.
export function _resetStorageForTests(): void {
  cached = null;
}

export type { StorageDriver } from "@/lib/storage/driver";
