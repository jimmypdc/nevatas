// Dev / test-only scanner. Returns "skipped" for every file. The scan
// status column is still populated (with provider="noop") so the same code
// paths that gate on scanStatus = "clean"|"skipped" exercise correctly.

import type { MalwareScanner, ScanResult } from "@/lib/scanning/driver";

export class NoopMalwareScanner implements MalwareScanner {
  readonly name = "noop" as const;

  async scan(): Promise<ScanResult> {
    return {
      verdict: "skipped",
      provider: "noop",
      details: { reason: "no_scanner_configured" },
    };
  }
}
