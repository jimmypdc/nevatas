// Malware scanner driver selection.
//
// Process-wide singleton chosen by the SCANNER_DRIVER env var. Defaults to
// the noop driver. Production deploys must set SCANNER_DRIVER=clamav or
// SCANNER_DRIVER=aws_guardduty and follow the corresponding wiring checklist.

import { AwsGuardDutyMalwareScanner } from "@/lib/scanning/aws-guardduty-scanner";
import { ClamAvMalwareScanner } from "@/lib/scanning/clamav-scanner";
import type { MalwareScanner } from "@/lib/scanning/driver";
import { NoopMalwareScanner } from "@/lib/scanning/noop-scanner";

let cached: MalwareScanner | null = null;

function build(): MalwareScanner {
  const driver = process.env.SCANNER_DRIVER ?? "noop";
  switch (driver) {
    case "noop":
      return new NoopMalwareScanner();
    case "clamav":
      return new ClamAvMalwareScanner();
    case "aws_guardduty":
      return new AwsGuardDutyMalwareScanner();
    default:
      throw new Error(`Unknown SCANNER_DRIVER=${driver}`);
  }
}

export function scanner(): MalwareScanner {
  if (!cached) cached = build();
  return cached;
}

export function _resetScannerForTests(): void {
  cached = null;
}

export type { MalwareScanner, ScanResult, ScanVerdict } from "@/lib/scanning/driver";
