// Strict, predictable parsers used by the normalization engine. Failures throw
// — the engine catches them and emits validation issues against the source row
// rather than dropping data silently.

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function parseDecimal(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") {
    throw new ParseError("value is empty");
  }
  let s = String(raw).trim();
  if (!s) throw new ParseError("value is empty");

  // Strip currency symbols and thousands separators; tolerate parentheses for negatives.
  const negParen = /^\((.+)\)$/.exec(s);
  if (negParen) s = `-${negParen[1]}`;
  s = s.replace(/[$,\s]/g, "");

  if (!DECIMAL_RE.test(s)) {
    throw new ParseError(`not a valid number: "${raw}"`);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) throw new ParseError(`not a finite number: "${raw}"`);
  // Round to 2dp at parse boundary; downstream Decimal arithmetic preserves precision.
  return Math.round(n * 100) / 100;
}

export function parseOptionalDecimal(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  return parseDecimal(raw);
}

// Accepts ISO (YYYY-MM-DD), US (M/D/YYYY or MM/DD/YYYY), and dotted formats.
// Returns a UTC midnight Date. Throws on invalid.
export function parseDate(raw: unknown): Date {
  if (raw === null || raw === undefined || raw === "") {
    throw new ParseError("date is empty");
  }
  const s = String(raw).trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return safeUtcDate(+iso[1]!, +iso[2]!, +iso[3]!);

  const us = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/.exec(s);
  if (us) {
    let yyyy = +us[3]!;
    if (yyyy < 100) yyyy = yyyy >= 70 ? 1900 + yyyy : 2000 + yyyy;
    return safeUtcDate(yyyy, +us[1]!, +us[2]!);
  }

  // Last resort: native parse, but only if it produces a valid date.
  const native = new Date(s);
  if (!Number.isNaN(native.getTime())) {
    return new Date(Date.UTC(native.getUTCFullYear(), native.getUTCMonth(), native.getUTCDate()));
  }
  throw new ParseError(`unrecognized date format: "${raw}"`);
}

function safeUtcDate(year: number, month: number, day: number): Date {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new ParseError(`invalid date components: ${year}-${month}-${day}`);
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new ParseError(`invalid calendar date: ${year}-${month}-${day}`);
  }
  return d;
}

const SSN_RE = /^\d{9}$/;

export function parseSsn(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") {
    throw new ParseError("SSN is empty");
  }
  const digits = String(raw).replace(/\D/g, "");
  if (!SSN_RE.test(digits)) {
    throw new ParseError("SSN must be 9 digits");
  }
  return digits;
}

export function parseTrimmedString(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}
