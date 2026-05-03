// Service: compute the totals implied by a source file + a candidate column
// mapping. Used by the upload UI's totals-confirmation step so the operator
// can compare what Nevatas computed from the line items against the totals
// printed on the source file's header / summary row.
//
// Reading the file's stored raw rows + normalizing in-memory keeps payroll
// data on the server — only summary numbers cross the wire.

import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { normalizeContributions, type Mapping } from "@/lib/normalization/engine";

export type PreviewTotalsResult = {
  rowCount: number;
  normalizedCount: number;
  parseIssueCount: number;
  computed: {
    grossCompensation: number;
    preTaxDeferral: number;
    rothDeferral: number;
    employerMatch: number;
    loanRepayment: number;
  };
};

export async function previewTotals(params: {
  organizationId: string;
  companyId: string;
  sourceFileId: string;
  mapping: Mapping;
}): Promise<PreviewTotalsResult> {
  const file = await db.payrollSourceFile.findUnique({
    where: { id: params.sourceFileId },
    select: {
      id: true,
      companyId: true,
      company: { select: { organizationId: true } },
      rawRows: { select: { rawJson: true }, orderBy: { rowIndex: "asc" } },
    },
  });
  if (!file || file.company.organizationId !== params.organizationId) throw notFound("Source file");
  if (file.companyId !== params.companyId) throw notFound("Source file");

  const { normalized, issues } = normalizeContributions({
    rows: file.rawRows.map((r) => r.rawJson as Record<string, string>),
    mapping: params.mapping,
  });

  const computed = {
    grossCompensation: 0,
    preTaxDeferral: 0,
    rothDeferral: 0,
    employerMatch: 0,
    loanRepayment: 0,
  };
  for (const c of normalized) {
    computed.grossCompensation += c.grossCompensation;
    computed.preTaxDeferral += c.preTaxDeferral;
    computed.rothDeferral += c.rothDeferral;
    computed.employerMatch += c.employerMatch;
    computed.loanRepayment += c.loanRepayment;
  }
  for (const k of Object.keys(computed) as (keyof typeof computed)[]) {
    computed[k] = Math.round(computed[k] * 100) / 100;
  }

  return {
    rowCount: file.rawRows.length,
    normalizedCount: normalized.length,
    parseIssueCount: issues.length,
    computed,
  };
}
