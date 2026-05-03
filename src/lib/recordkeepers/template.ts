// Recordkeeper output-template interface. Each implementation renders a
// validated payroll run into the bytes the recordkeeper expects to receive
// (CSV, fixed-width text, etc.).
//
// Real production templates are recordkeeper-issued specs that vary by plan
// and need exact column counts, date formats, SSN formats, padding rules,
// totals rows, footers, and so on. The adapter pattern here lets a new
// template land as a single ~50-line file that registers itself; existing
// generation code is untouched.

import type { Prisma } from "@prisma/client";

export type ContributionRow = {
  externalEmployeeId: string | null;
  participantFirstName: string | null;
  participantLastName: string | null;
  participantSsnLast4: string | null;
  // Decimal values come straight from Prisma; templates serialize them.
  grossCompensation: Prisma.Decimal;
  preTaxDeferral: Prisma.Decimal;
  rothDeferral: Prisma.Decimal;
  employerMatch: Prisma.Decimal;
  loanRepayment: Prisma.Decimal;
};

export type RenderInput = {
  payrollDate: Date;
  contributions: ContributionRow[];
  // Plan-level metadata available to header rows / footer totals.
  planName: string;
  planNumber: string | null;
  companyName: string;
};

export type RenderedFile = {
  bytes: Buffer;
  contentType: string;
  fileExtension: string;
};

export interface RecordkeeperTemplate {
  // Stable identifier persisted on ContributionFile.format and selected via
  // PlanRules.outputFormat. Don't change once a customer is using it — the
  // existing rule versions will reference it.
  readonly key: string;
  readonly displayName: string;
  readonly description: string;
  render(input: RenderInput): RenderedFile;
}

// Helper for CSV serialization. RFC 4180 quoting.
export function csvField(s: string | number): string {
  const str = typeof s === "number" ? String(s) : s;
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function csvLine(fields: (string | number)[]): string {
  return fields.map(csvField).join(",");
}
