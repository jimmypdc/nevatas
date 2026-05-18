// CSV serializer for evidence / audit exports. Two defenses on top of
// RFC 4180 quoting:
//
//   1) Formula-injection escape. When the auditor opens the CSV in Excel /
//      Sheets / Numbers, any cell starting with =, +, -, @, tab, or CR is
//      treated as a formula. We prefix such cells with a single apostrophe
//      so the spreadsheet renders them as text instead of evaluating them.
//      Apostrophe is consumed by the spreadsheet and not visible in the
//      cell value. (OWASP CSV Injection / CWE-1236.)
//
//   2) RFC 4180 quoting. Any cell containing a quote, comma, CR, or LF is
//      wrapped in double quotes with internal quotes doubled.
//
// We DON'T apply these to the recordkeeper output templates in
// lib/recordkeepers/templates/* — those go to recordkeeper systems that
// parse raw text and would mis-handle the leading apostrophe.

const FORMULA_PREFIXES = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function csvSafeField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const str = v instanceof Date ? v.toISOString() : String(v);
  if (str.length === 0) return "";

  // Step 1: formula-injection escape.
  const first = str[0]!;
  const escaped = FORMULA_PREFIXES.has(first) ? `'${str}` : str;

  // Step 2: RFC 4180 quoting.
  if (/["\n\r,]/.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}

export function csvSafeLine(fields: unknown[]): string {
  return fields.map(csvSafeField).join(",");
}

// Build a complete CSV document from a header row + data rows. Always ends
// with a trailing newline — some spreadsheets require it to register the
// last row. CRLF line endings per RFC 4180.
export function csvSafeFile(headers: string[], rows: unknown[][]): string {
  const lines = [csvSafeLine(headers)];
  for (const row of rows) {
    lines.push(csvSafeLine(row));
  }
  return lines.join("\r\n") + "\r\n";
}
