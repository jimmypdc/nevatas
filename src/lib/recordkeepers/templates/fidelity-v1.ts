// Fidelity-style CSV. Illustrative — real Fidelity files vary by plan
// and require recordkeeper-issued spec. The shape demonstrates more
// variations:
//   - Pipe-delimited (despite the .csv extension Fidelity sometimes uses)
//   - YYYYMMDD date with no separators
//   - Plan-number prefix on every row
//   - Different column order: SSN-bearing systems often lead with SSN

import type { RecordkeeperTemplate, RenderInput, RenderedFile } from "@/lib/recordkeepers/template";

export const fidelityV1: RecordkeeperTemplate = {
  key: "fidelity.v1",
  displayName: "Fidelity (illustrative)",
  description:
    "Illustrative Fidelity-style file: pipe-delimited, YYYYMMDD date, plan-number prefix per row.",
  render(input: RenderInput): RenderedFile {
    const headers = [
      "PLAN_NUMBER",
      "PAY_DATE",
      "EMPLOYEE_ID",
      "SSN_LAST4",
      "FIRST_NAME",
      "LAST_NAME",
      "COMP",
      "PRETAX",
      "ROTH",
      "MATCH",
      "LOAN",
    ];
    const dateCompact = formatYyyymmdd(input.payrollDate);
    const planNumber = input.planNumber ?? "";
    const lines: string[] = [pipeLine(headers)];

    for (const c of input.contributions) {
      lines.push(
        pipeLine([
          planNumber,
          dateCompact,
          c.externalEmployeeId ?? "",
          c.participantSsnLast4 ?? "",
          c.participantFirstName ?? "",
          c.participantLastName ?? "",
          Number(c.grossCompensation).toFixed(2),
          Number(c.preTaxDeferral).toFixed(2),
          Number(c.rothDeferral).toFixed(2),
          Number(c.employerMatch).toFixed(2),
          Number(c.loanRepayment).toFixed(2),
        ]),
      );
    }

    return {
      bytes: Buffer.from(lines.join("\r\n") + "\r\n", "utf8"),
      contentType: "text/csv",
      fileExtension: "csv",
    };
  },
};

function formatYyyymmdd(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}${m}${day}`;
}

function pipeLine(fields: (string | number)[]): string {
  // Strip pipe characters from values so they can't break the format.
  return fields.map((f) => String(f).replace(/\|/g, " ")).join("|");
}
