// Nevatas-internal canonical CSV format. Default fallback when no
// recordkeeper-specific template is configured on the plan.

import { csvLine, type RecordkeeperTemplate, type RenderInput, type RenderedFile } from "@/lib/recordkeepers/template";

export const nevatasV1: RecordkeeperTemplate = {
  key: "nevatas.v1",
  displayName: "Nevatas Generic CSV",
  description:
    "Canonical Nevatas CSV. ISO date, SSN last-4 only, alphabetic column order. Default when no recordkeeper-specific format is configured.",
  render(input: RenderInput): RenderedFile {
    const headers = [
      "payroll_date",
      "employee_id",
      "first_name",
      "last_name",
      "ssn_last4",
      "gross_compensation",
      "pretax_deferral",
      "roth_deferral",
      "employer_match",
      "loan_repayment",
    ];
    const lines: string[] = [csvLine(headers)];
    const dateIso = input.payrollDate.toISOString().slice(0, 10);
    for (const c of input.contributions) {
      lines.push(
        csvLine([
          dateIso,
          c.externalEmployeeId ?? "",
          c.participantFirstName ?? "",
          c.participantLastName ?? "",
          c.participantSsnLast4 ?? "",
          c.grossCompensation.toFixed(2),
          c.preTaxDeferral.toFixed(2),
          c.rothDeferral.toFixed(2),
          c.employerMatch.toFixed(2),
          c.loanRepayment.toFixed(2),
        ]),
      );
    }
    return {
      bytes: Buffer.from(lines.join("\n") + "\n", "utf8"),
      contentType: "text/csv",
      fileExtension: "csv",
    };
  },
};
