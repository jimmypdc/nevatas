// Normalization engine. Takes raw CSV rows + a column mapping and produces:
//   - normalized contributions (one per row)
//   - per-row parse issues (when fields are unparseable)
//
// Raw rows must be preserved verbatim by the caller in SourceRow before
// invoking this engine. We never mutate raw data here.

import { CONTRIBUTION_FIELDS, fieldByKey, type CanonicalFieldDef } from "@/lib/normalization/contribution-fields";
import {
  parseDate,
  parseDecimal,
  parseOptionalDecimal,
  parseSsn,
  parseTrimmedString,
  ParseError,
} from "@/lib/normalization/parsers";

export const TRANSFORM_VERSION = "contribution.v1";

export type NormalizedContribution = {
  externalEmployeeId: string;
  ssnLast4?: string;
  firstName?: string;
  lastName?: string;
  payrollDate: Date;
  payPeriodStart?: Date;
  payPeriodEnd?: Date;
  grossCompensation: number;
  eligibleCompensation?: number;
  preTaxDeferral: number;
  rothDeferral: number;
  afterTaxContribution?: number;
  employerMatch: number;
  safeHarborMatch?: number;
  safeHarborNonelective?: number;
  profitSharing?: number;
  loanRepayment: number;
  raw: Record<string, string>;
  rowIndex: number;
};

export type RowIssue = {
  rowIndex: number;
  field: string;
  message: string;
  value: string | undefined;
};

export type NormalizeResult = {
  normalized: NormalizedContribution[];
  issues: RowIssue[];
  // SSN plaintext keyed by rowIndex so the caller can encrypt before persisting.
  ssnByRow: Map<number, string>;
};

export type Mapping = Record<string, string>; // canonical key -> source header

export function normalizeContributions(params: {
  rows: Record<string, string>[];
  mapping: Mapping;
}): NormalizeResult {
  const { rows, mapping } = params;
  const normalized: NormalizedContribution[] = [];
  const issues: RowIssue[] = [];
  const ssnByRow = new Map<number, string>();

  rows.forEach((row, rowIndex) => {
    const result = normalizeRow(row, mapping, rowIndex, issues);
    if (result) {
      normalized.push(result.contribution);
      if (result.ssn) ssnByRow.set(rowIndex, result.ssn);
    }
  });

  return { normalized, issues, ssnByRow };
}

function normalizeRow(
  row: Record<string, string>,
  mapping: Mapping,
  rowIndex: number,
  issues: RowIssue[],
): { contribution: NormalizedContribution; ssn: string | null } | null {
  const get = (key: string): string | undefined => {
    const header = mapping[key];
    if (!header) return undefined;
    const v = row[header];
    return v === undefined || v === "" ? undefined : v;
  };

  const tryParse = <T>(field: CanonicalFieldDef, fn: () => T): T | null => {
    try {
      return fn();
    } catch (err) {
      const message = err instanceof ParseError ? err.message : "parse failed";
      issues.push({
        rowIndex,
        field: field.key,
        message,
        value: get(field.key),
      });
      return null;
    }
  };

  // Required fields first — if any are missing or unparseable, we still emit
  // issues but skip producing a contribution record so downstream validation
  // doesn't operate on garbage.
  const empIdField = fieldByKey("externalEmployeeId")!;
  const empIdRaw = get("externalEmployeeId");
  if (!empIdRaw) {
    issues.push({ rowIndex, field: empIdField.key, message: "required field is missing", value: undefined });
    return null;
  }
  const externalEmployeeId = parseTrimmedString(empIdRaw);

  const payrollDateField = fieldByKey("payrollDate")!;
  const payrollDate = tryParse(payrollDateField, () => parseDate(get("payrollDate")));
  if (!payrollDate) return null;

  const grossField = fieldByKey("grossCompensation")!;
  const grossCompensation = tryParse(grossField, () => parseDecimal(get("grossCompensation")));
  if (grossCompensation === null) return null;

  const optDate = (key: string) => {
    if (!get(key)) return undefined;
    const f = fieldByKey(key)!;
    const v = tryParse(f, () => parseDate(get(key)));
    return v ?? undefined;
  };
  const optDecimal = (key: string): number | undefined => {
    if (!get(key)) return undefined;
    const f = fieldByKey(key)!;
    const v = tryParse(f, () => parseOptionalDecimal(get(key)));
    return v ?? undefined;
  };
  const required0 = (key: string): number => {
    if (!get(key)) return 0;
    const f = fieldByKey(key)!;
    const v = tryParse(f, () => parseDecimal(get(key)));
    return v ?? 0;
  };

  let ssn: string | null = null;
  const ssnRaw = get("ssn");
  if (ssnRaw) {
    const f = fieldByKey("ssn")!;
    ssn = tryParse(f, () => parseSsn(ssnRaw));
  }

  const contribution: NormalizedContribution = {
    externalEmployeeId,
    ssnLast4: ssn ? ssn.slice(-4) : undefined,
    firstName: get("firstName") ? parseTrimmedString(get("firstName")) : undefined,
    lastName: get("lastName") ? parseTrimmedString(get("lastName")) : undefined,
    payrollDate,
    payPeriodStart: optDate("payPeriodStart"),
    payPeriodEnd: optDate("payPeriodEnd"),
    grossCompensation,
    eligibleCompensation: optDecimal("eligibleCompensation"),
    preTaxDeferral: required0("preTaxDeferral"),
    rothDeferral: required0("rothDeferral"),
    afterTaxContribution: optDecimal("afterTaxContribution"),
    employerMatch: required0("employerMatch"),
    safeHarborMatch: optDecimal("safeHarborMatch"),
    safeHarborNonelective: optDecimal("safeHarborNonelective"),
    profitSharing: optDecimal("profitSharing"),
    loanRepayment: required0("loanRepayment"),
    raw: row,
    rowIndex,
  };

  return { contribution, ssn };
}

// Verifies that all required canonical fields have a header in the mapping.
export function validateMappingCompleteness(mapping: Mapping): { ok: boolean; missing: string[] } {
  const missing = CONTRIBUTION_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.key);
  return { ok: missing.length === 0, missing };
}
