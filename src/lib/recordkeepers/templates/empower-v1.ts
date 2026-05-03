// Empower-style CSV. Illustrative — real Empower files vary by plan and
// require recordkeeper-issued spec. The shape demonstrates the variations
// the adapter pattern absorbs:
//   - MM/DD/YYYY date
//   - Distinct column headers + a leading record-type column
//   - Trailing summary row with totals (recordkeeper sanity-check)

import { csvLine, type RecordkeeperTemplate, type RenderInput, type RenderedFile } from "@/lib/recordkeepers/template";

export const empowerV1: RecordkeeperTemplate = {
  key: "empower.v1",
  displayName: "Empower (illustrative)",
  description:
    "Illustrative Empower-style CSV: MM/DD/YYYY pay date, distinct headers, leading record-type column, trailing totals row.",
  render(input: RenderInput): RenderedFile {
    const headers = [
      "RECORD_TYPE",
      "PAY_DATE",
      "EMPLOYEE_ID",
      "FIRST_NAME",
      "LAST_NAME",
      "SSN_LAST4",
      "COMPENSATION",
      "EE_PRETAX_401K",
      "EE_ROTH_401K",
      "ER_MATCH",
      "LOAN_REPAYMENT",
    ];
    const dateUs = formatMmDdYyyy(input.payrollDate);
    const lines: string[] = [csvLine(headers)];

    let totals = {
      comp: 0,
      pre: 0,
      roth: 0,
      match: 0,
      loan: 0,
    };

    for (const c of input.contributions) {
      const comp = Number(c.grossCompensation);
      const pre = Number(c.preTaxDeferral);
      const roth = Number(c.rothDeferral);
      const match = Number(c.employerMatch);
      const loan = Number(c.loanRepayment);
      totals = {
        comp: totals.comp + comp,
        pre: totals.pre + pre,
        roth: totals.roth + roth,
        match: totals.match + match,
        loan: totals.loan + loan,
      };
      lines.push(
        csvLine([
          "DETAIL",
          dateUs,
          c.externalEmployeeId ?? "",
          c.participantFirstName ?? "",
          c.participantLastName ?? "",
          c.participantSsnLast4 ?? "",
          comp.toFixed(2),
          pre.toFixed(2),
          roth.toFixed(2),
          match.toFixed(2),
          loan.toFixed(2),
        ]),
      );
    }

    lines.push(
      csvLine([
        "TOTAL",
        dateUs,
        "",
        "",
        "",
        "",
        round2(totals.comp).toFixed(2),
        round2(totals.pre).toFixed(2),
        round2(totals.roth).toFixed(2),
        round2(totals.match).toFixed(2),
        round2(totals.loan).toFixed(2),
      ]),
    );

    return {
      bytes: Buffer.from(lines.join("\r\n") + "\r\n", "utf8"),
      contentType: "text/csv",
      fileExtension: "csv",
    };
  },
};

function formatMmDdYyyy(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${m}/${day}/${d.getUTCFullYear()}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
