// Service: generate a recordkeeper contribution file from a validated
// payroll run. The output template is selected from PlanRules.outputFormat
// against lib/recordkeepers; defaults to nevatas.v1 when unspecified or
// when the configured key isn't registered.

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { sha256Hex } from "@/lib/crypto/hashing";
import { storage } from "@/lib/storage";
import { contributionOutputKey } from "@/lib/storage/keys";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";
import { invalidateApprovalIfActive } from "@/lib/services/approval-invalidation";
import { templateOrDefault } from "@/lib/recordkeepers";
import type { PlanRules } from "@/lib/validation/types";

export type GenerateContributionFileInput = {
  organizationId: string;
  companyId: string;
  actorUserId: string;
  payrollRunId: string;
  // Optional override; otherwise the plan's effective rule selects the
  // template via outputFormat.
  format?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type GenerateContributionFileResult = {
  contributionFileId: string;
  storageKey: string;
  checksum: string;
  version: number;
  format: string;
};

export async function generateContributionFile(
  input: GenerateContributionFileInput,
): Promise<GenerateContributionFileResult> {
  const run = await db.payrollRun.findUnique({
    where: { id: input.payrollRunId },
    include: {
      plan: {
        include: {
          company: { select: { name: true } },
          ruleVersions: { orderBy: { effectiveDate: "desc" }, take: 5 },
        },
      },
      contributions: { include: { participant: true } },
      validationIssues: true,
      contributionFiles: { orderBy: { version: "desc" }, take: 1 },
      correctionCycles: { where: { status: "open" }, take: 1 },
    },
  });
  if (!run) throw notFound("Payroll run");
  if (run.plan.companyId !== input.companyId) throw notFound("Payroll run");

  const openBlocking = run.validationIssues.filter(
    (i) => i.severity === "blocking" && i.status === "open",
  );
  if (openBlocking.length > 0) {
    throw blockedByPolicy(
      "Cannot generate contribution file while blocking exceptions remain open",
      { openBlockingCount: openBlocking.length },
    );
  }
  if (run.contributions.length === 0) {
    throw validationError("Payroll run has no contributions");
  }

  // Pick the effective template: explicit override > plan rule > default.
  const planRules = pickPlanRules(run.plan.ruleVersions, run.payrollDate);
  const formatKey = input.format ?? planRules?.outputFormat ?? null;
  const template = templateOrDefault(formatKey);

  const rendered = template.render({
    payrollDate: run.payrollDate,
    contributions: run.contributions.map((c) => ({
      externalEmployeeId: c.externalEmployeeId,
      participantFirstName: c.participant?.firstName ?? null,
      participantLastName: c.participant?.lastName ?? null,
      participantSsnLast4: c.participant?.ssnLast4 ?? null,
      grossCompensation: c.grossCompensation,
      preTaxDeferral: c.preTaxDeferral,
      rothDeferral: c.rothDeferral,
      employerMatch: c.employerMatch,
      loanRepayment: c.loanRepayment,
    })),
    planName: run.plan.name,
    planNumber: run.plan.planNumber,
    companyName: run.plan.company.name,
  });
  const checksum = sha256Hex(rendered.bytes);

  const nextVersion = (run.contributionFiles[0]?.version ?? 0) + 1;
  const fileId = randomUUID();
  const fileName = `contributions_${run.payrollDate.toISOString().slice(0, 10)}_v${nextVersion}.${rendered.fileExtension}`;
  const storageKey = contributionOutputKey({
    companyId: input.companyId,
    payrollRunId: run.id,
    fileId,
    version: nextVersion,
    fileName,
  });

  await storage().putObject({
    key: storageKey,
    body: rendered.bytes,
    contentType: rendered.contentType,
  });

  const created = await db.$transaction(async (tx) => {
    const inv = await invalidateApprovalIfActive(tx, {
      organizationId: input.organizationId,
      companyId: input.companyId,
      planId: run.planId,
      actorUserId: input.actorUserId,
      payrollRunId: run.id,
      reason: `Contribution file v${nextVersion} generated after prior approval`,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });

    const openCycleId = run.correctionCycles[0]?.id ?? null;
    const cf = await tx.contributionFile.create({
      data: {
        id: fileId,
        payrollRunId: run.id,
        correctionCycleId: openCycleId,
        version: nextVersion,
        status: "generated",
        storageKey,
        checksum,
        format: template.key,
        generatedById: input.actorUserId,
      },
    });
    if (!inv.invalidated) {
      await tx.payrollRun.update({
        where: { id: run.id },
        data: { status: "generated" },
      });
    }

    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: input.companyId,
        planId: run.planId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.contributionFileGenerated,
        entityType: "contribution_file",
        entityId: cf.id,
        after: {
          version: cf.version,
          checksum: cf.checksum,
          format: cf.format,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return cf;
  });

  return {
    contributionFileId: created.id,
    storageKey: created.storageKey,
    checksum: created.checksum,
    version: created.version,
    format: template.key,
  };
}

function pickPlanRules(
  versions: { effectiveDate: Date; rulesJson: unknown }[],
  payrollDate: Date,
): PlanRules | null {
  const eligible = versions
    .filter((v) => v.effectiveDate <= payrollDate)
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());
  return eligible.length > 0 ? (eligible[0]!.rulesJson as PlanRules) : null;
}
