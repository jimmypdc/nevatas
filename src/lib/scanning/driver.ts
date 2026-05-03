// Malware scanner driver interface.
//
// A scanner takes the storage key of a freshly-uploaded object and returns
// a verdict. Implementations are pluggable so a deployment can choose the
// scanner that fits its infrastructure (ClamAV daemon for self-host, AWS
// GuardDuty Malware Protection for AWS, third-party API, etc.).
//
// Verdicts:
//   - clean      : safe to proceed; no signatures matched.
//   - infected   : signatures matched; the file must NOT be parsed or
//                  released to downstream pipelines without an explicit
//                  authorized override (payroll_file.scan.override).
//   - skipped    : the configured driver is "noop" or the file type is not
//                  in scope for the scanner. Treated as soft-clean.
//   - error      : the scanner failed to render a verdict (e.g. network
//                  timeout). Operator must retry or override.

export type ScanVerdict = "clean" | "infected" | "skipped" | "error";

export type ScanResult = {
  verdict: ScanVerdict;
  provider: string;
  // Free-form provider-specific payload — signature names, scan id,
  // GuardDuty findings ARN, etc. Persisted as scanResult JSON.
  details?: Record<string, unknown>;
};

export interface MalwareScanner {
  readonly name: "noop" | "clamav" | "aws_guardduty";

  // Scan a stored object by its storage key. Implementations may pull bytes
  // (clamav) or query an external scan service that already inspected the
  // object on PutObject (guardduty). The function should not throw on
  // signature matches — that's a "infected" verdict, not an error.
  scan(input: { storageKey: string; sizeBytes: number; mimeType: string }): Promise<ScanResult>;
}
