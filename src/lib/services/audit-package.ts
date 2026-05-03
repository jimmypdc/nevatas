// Audit-package builder. Produces a single ZIP that bundles every artifact
// a TPA / plan auditor would ask for in a SOC 2 or DOL audit:
//
//   manifest.json              checksums + metadata for every entry
//   source/<filename>          the raw uploaded CSV (verbatim)
//   validation-issues.csv      every issue surfaced for the run
//   contributions.csv          normalized line items as the engine saw them
//   contribution-file/v<N>...  every generated contribution file (latest first)
//   approvals.json             every ApprovalRecord on the run
//   correction-cycles.json     every CorrectionCycle on the run
//   audit-events.json          every AuditEvent touching the run + its files
//
// The package ID matches the payroll run id; the manifest carries the
// generation timestamp + the actor who exported it.
//
// Phase 1 builds the ZIP in memory; with our typical run size (a few MB
// of CSV at most) that's fine. Larger plans will need streaming via
// archiver — left as a future enhancement, documented in the route handler.

import JSZip from "jszip";

import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto/hashing";
import { notFound } from "@/lib/errors";
import { csvLine } from "@/lib/recordkeepers/template";
import { storage } from "@/lib/storage";

export type BuildAuditPackageInput = {
  organizationId: string;
  payrollRunId: string;
  exportedByUserId: string;
};

export type AuditPackageResult = {
  zipBytes: Buffer;
  fileName: string;
  manifest: {
    payrollRunId: string;
    payrollDate: string;
    exportedAt: string;
    exportedByUserId: string;
    entries: { name: string; sizeBytes: number; sha256Hex: string }[];
  };
};

export async function buildAuditPackage(input: BuildAuditPackageInput): Promise<AuditPackageResult> {
  const run = await db.payrollRun.findUnique({
    where: { id: input.payrollRunId },
    include: {
      plan: { include: { company: true } },
      sourceFile: true,
      contributions: {
        include: {
          participant: { select: { firstName: true, lastName: true, ssnLast4: true } },
        },
        orderBy: { externalEmployeeId: "asc" },
      },
      validationIssues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
      contributionFiles: { orderBy: { version: "desc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      correctionCycles: { orderBy: { openedAt: "desc" } },
    },
  });
  if (!run) throw notFound("Payroll run");
  if (run.plan.company.organizationId !== input.organizationId) throw notFound("Payroll run");

  const auditEvents = await db.auditEvent.findMany({
    where: {
      organizationId: input.organizationId,
      OR: [
        { entityType: "payroll_run", entityId: run.id },
        ...run.contributionFiles.map((f) => ({
          entityType: "contribution_file",
          entityId: f.id,
        })),
        ...run.approvals.map((a) => ({ entityType: "approval_record", entityId: a.id })),
        ...run.correctionCycles.map((c) => ({
          entityType: "correction_cycle",
          entityId: c.id,
        })),
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const zip = new JSZip();
  const entries: AuditPackageResult["manifest"]["entries"] = [];

  function addEntry(name: string, bytes: Buffer): void {
    zip.file(name, bytes);
    entries.push({ name, sizeBytes: bytes.length, sha256Hex: sha256Hex(bytes) });
  }

  // Source file (verbatim).
  if (run.sourceFile) {
    try {
      const bytes = await storage().getObject(run.sourceFile.storageKey);
      addEntry(`source/${run.sourceFile.fileName}`, bytes);
    } catch {
      addEntry(
        "source/_FETCH_FAILED.txt",
        Buffer.from(
          `Could not retrieve source file from storage at ${new Date().toISOString()}.\n`,
          "utf8",
        ),
      );
    }
  }

  // Validation issues as CSV.
  const issueCsv = renderIssuesCsv(run.validationIssues);
  addEntry("validation-issues.csv", Buffer.from(issueCsv, "utf8"));

  // Normalized contributions as CSV.
  const contribCsv = renderContributionsCsv(run.contributions);
  addEntry("contributions.csv", Buffer.from(contribCsv, "utf8"));

  // Each generated contribution file.
  for (const f of run.contributionFiles) {
    try {
      const bytes = await storage().getObject(f.storageKey);
      addEntry(`contribution-files/v${f.version}_${f.format}`, bytes);
    } catch {
      addEntry(
        `contribution-files/v${f.version}_${f.format}._FETCH_FAILED.txt`,
        Buffer.from(`Could not retrieve from storage at ${new Date().toISOString()}.\n`, "utf8"),
      );
    }
  }

  // Approvals + cycles + events as JSON.
  addEntry(
    "approvals.json",
    Buffer.from(JSON.stringify(run.approvals, replacer, 2), "utf8"),
  );
  addEntry(
    "correction-cycles.json",
    Buffer.from(JSON.stringify(run.correctionCycles, replacer, 2), "utf8"),
  );
  addEntry(
    "audit-events.json",
    Buffer.from(JSON.stringify(auditEvents, replacer, 2), "utf8"),
  );

  const manifest = {
    payrollRunId: run.id,
    payrollDate: run.payrollDate.toISOString().slice(0, 10),
    plan: { id: run.plan.id, name: run.plan.name, planNumber: run.plan.planNumber },
    company: { id: run.plan.company.id, name: run.plan.company.name },
    exportedAt: new Date().toISOString(),
    exportedByUserId: input.exportedByUserId,
    entries,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const zipBytes = Buffer.from(
    await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
  );
  const fileName = `nevatas-audit-package_${run.plan.company.name.replace(/[^A-Za-z0-9]+/g, "_")}_${run.payrollDate
    .toISOString()
    .slice(0, 10)}_${run.id.slice(0, 8)}.zip`;

  return { zipBytes, fileName, manifest };
}

function renderIssuesCsv(issues: {
  ruleKey: string;
  severity: string;
  category: string;
  entityType: string;
  entityId: string | null;
  message: string;
  status: string;
  resolutionNote: string | null;
  waiverReason: string | null;
  expectedValue: string | null;
  actualValue: string | null;
  createdAt: Date;
}[]): string {
  const lines: string[] = [
    csvLine([
      "rule_key",
      "severity",
      "category",
      "entity_type",
      "entity_id",
      "message",
      "expected",
      "actual",
      "status",
      "resolution_note",
      "waiver_reason",
      "created_at",
    ]),
  ];
  for (const i of issues) {
    lines.push(
      csvLine([
        i.ruleKey,
        i.severity,
        i.category,
        i.entityType,
        i.entityId ?? "",
        i.message,
        i.expectedValue ?? "",
        i.actualValue ?? "",
        i.status,
        i.resolutionNote ?? "",
        i.waiverReason ?? "",
        i.createdAt.toISOString(),
      ]),
    );
  }
  return lines.join("\n") + "\n";
}

function renderContributionsCsv(contributions: {
  externalEmployeeId: string | null;
  participant: { firstName: string; lastName: string; ssnLast4: string | null } | null;
  grossCompensation: import("@prisma/client").Prisma.Decimal;
  preTaxDeferral: import("@prisma/client").Prisma.Decimal;
  rothDeferral: import("@prisma/client").Prisma.Decimal;
  employerMatch: import("@prisma/client").Prisma.Decimal;
  loanRepayment: import("@prisma/client").Prisma.Decimal;
}[]): string {
  const lines: string[] = [
    csvLine([
      "employee_id",
      "first_name",
      "last_name",
      "ssn_last4",
      "gross_compensation",
      "pretax_deferral",
      "roth_deferral",
      "employer_match",
      "loan_repayment",
    ]),
  ];
  for (const c of contributions) {
    lines.push(
      csvLine([
        c.externalEmployeeId ?? "",
        c.participant?.firstName ?? "",
        c.participant?.lastName ?? "",
        c.participant?.ssnLast4 ?? "",
        c.grossCompensation.toFixed(2),
        c.preTaxDeferral.toFixed(2),
        c.rothDeferral.toFixed(2),
        c.employerMatch.toFixed(2),
        c.loanRepayment.toFixed(2),
      ]),
    );
  }
  return lines.join("\n") + "\n";
}

// JSON replacer that serializes Prisma.Decimal + Date instances to strings
// rather than the default Object representation.
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toFixed" in value && typeof (value as { toFixed: unknown }).toFixed === "function") {
    return (value as { toFixed: (n: number) => string }).toFixed(2);
  }
  return value;
}
