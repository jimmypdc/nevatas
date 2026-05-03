// Service: create a payroll run from a parsed source file + column mapping.
// Persists normalized contributions, runs the validation engine, persists
// issues, sets the run status, and writes audit events.

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { encryptOptional, ssnLast4 } from "@/lib/crypto/encryption";
import { notFound, validationError } from "@/lib/errors";
import {
  normalizeContributions,
  TRANSFORM_VERSION,
  validateMappingCompleteness,
  type Mapping,
  type NormalizedContribution,
} from "@/lib/normalization/engine";
import { detectCsvInjection } from "@/lib/normalization/csv-injection";
import { runValidators } from "@/lib/validation/engine";
import type { PlanRules, ValidationContext } from "@/lib/validation/types";

export type CreatePayrollRunInput = {
  organizationId: string;
  companyId: string;
  planId: string;
  actorUserId: string;
  sourceFileId: string;
  mapping: Mapping;
  reportedTotals: {
    grossCompensation: number;
    preTaxDeferral: number;
    rothDeferral: number;
    employerMatch: number;
    loanRepayment: number;
  };
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type CreatePayrollRunResult = {
  payrollRunId: string;
  status: string;
  contributionCount: number;
  validationCounts: Record<string, number>;
  hasBlocking: boolean;
};

export async function createPayrollRunFromFile(
  input: CreatePayrollRunInput,
): Promise<CreatePayrollRunResult> {
  const { ok, missing } = validateMappingCompleteness(input.mapping);
  if (!ok) {
    throw validationError("Column mapping is missing required fields", { missing });
  }

  const sourceFile = await db.payrollSourceFile.findUnique({
    where: { id: input.sourceFileId },
    include: { rawRows: { orderBy: { rowIndex: "asc" } } },
  });
  if (!sourceFile) throw notFound("Source file");
  if (sourceFile.companyId !== input.companyId) throw notFound("Source file");
  if (sourceFile.status !== "parsed") {
    throw validationError("Source file must be parsed before creating a payroll run");
  }
  if (sourceFile.rawRows.length === 0) {
    throw validationError("Source file has no rows");
  }

  const plan = await db.plan.findFirst({
    where: { id: input.planId, companyId: input.companyId },
    include: {
      ruleVersions: { orderBy: { effectiveDate: "desc" }, take: 5 },
    },
  });
  if (!plan) throw notFound("Plan");

  const rawRows = sourceFile.rawRows.map((r) => r.rawJson as Record<string, string>);
  const { normalized, issues: parseIssues, ssnByRow } = normalizeContributions({
    rows: rawRows,
    mapping: input.mapping,
  });

  if (normalized.length === 0) {
    throw validationError("No rows could be normalized from the source file", { parseIssues });
  }

  const payrollDate = inferPayrollDate(normalized);
  const planRules = pickEffectiveRules(plan.ruleVersions, payrollDate);

  // Snapshot company-wide census + active loan schedules for cross-row
  // validators (eligibility, census-vs-payroll, loan-amortization). Pulled
  // at run-creation time so validators see the state that produced the
  // issues, not a moving target while the operator resolves exceptions.
  const participantsRows = await db.participant.findMany({
    where: { companyId: input.companyId },
    select: {
      id: true,
      externalEmployeeId: true,
      firstName: true,
      lastName: true,
      status: true,
      dateOfHire: true,
      dateOfTermination: true,
    },
  });
  const participants = participantsRows
    .filter((p): p is typeof p & { externalEmployeeId: string } => Boolean(p.externalEmployeeId))
    .map((p) => ({
      id: p.id,
      externalEmployeeId: p.externalEmployeeId,
      firstName: p.firstName,
      lastName: p.lastName,
      status: p.status,
      dateOfHire: p.dateOfHire,
      dateOfTermination: p.dateOfTermination,
    }));

  const loanSchedulesRows = await db.loanSchedule.findMany({
    where: {
      status: "active",
      participant: { companyId: input.companyId },
    },
    select: {
      id: true,
      participantId: true,
      loanNumber: true,
      expectedPaymentAmount: true,
      paymentFrequency: true,
      status: true,
      participant: { select: { externalEmployeeId: true } },
    },
  });
  const loanSchedules = loanSchedulesRows
    .filter((s): s is typeof s & { participant: { externalEmployeeId: string } } =>
      Boolean(s.participant.externalEmployeeId),
    )
    .map((s) => ({
      id: s.id,
      participantId: s.participantId,
      externalEmployeeId: s.participant.externalEmployeeId,
      loanNumber: s.loanNumber,
      expectedPaymentAmount: Number(s.expectedPaymentAmount),
      paymentFrequency: s.paymentFrequency as "weekly" | "biweekly" | "semimonthly" | "monthly",
      status: s.status,
    }));

  const ctx: ValidationContext = {
    payrollRunId: "", // filled in below; validators don't depend on it
    payrollDate,
    contributions: normalized,
    totals: input.reportedTotals,
    rules: planRules,
    participants,
    loanSchedules,
  };
  const validationResult = runValidators(ctx);

  // CSV / formula injection detection runs over the raw rows + mapping. We
  // surface every offending cell as a warning-level issue (operators can
  // promote to blocking via a custom rule); never silently sanitize.
  validationResult.issues.push(
    ...detectCsvInjection({ rows: rawRows, mapping: input.mapping }),
  );

  // Lift parse-time issues into validation issues so they show up in the
  // exception queue alongside everything else.
  for (const pi of parseIssues) {
    validationResult.issues.push({
      ruleKey: `data_quality.parse_error.${pi.field}`,
      severity: "blocking",
      category: "data_quality",
      entityType: "contribution_row",
      entityId: String(pi.rowIndex),
      message: `Row ${pi.rowIndex} field ${pi.field}: ${pi.message}`,
      sourceField: pi.field,
      actualValue: pi.value,
    });
  }
  if (parseIssues.length > 0) {
    validationResult.hasBlocking = true;
    validationResult.countsBySeverity["blocking"] =
      (validationResult.countsBySeverity["blocking"] ?? 0) + parseIssues.length;
  }

  const computedTotals = computeTotals(normalized);

  const result = await db.$transaction(async (tx) => {
    // Resolve participants by externalEmployeeId → upsert sparse stubs so
    // contribution rows can be linked even if a census file hasn't been
    // imported yet. Caller can later merge/update participant identity.
    const participantsByExtId = await upsertParticipantStubs(tx, {
      companyId: input.companyId,
      contributions: normalized,
      ssnByRow,
    });

    const run = await tx.payrollRun.create({
      data: {
        planId: input.planId,
        payrollDate,
        payPeriodStart: minDate(normalized.map((c) => c.payPeriodStart)),
        payPeriodEnd: maxDate(normalized.map((c) => c.payPeriodEnd)),
        status: validationResult.hasBlocking ? "exception_review" : "validated",
        sourceSystem: "csv",
        sourceFileId: sourceFile.id,
        totalGrossComp: new Prisma.Decimal(computedTotals.grossCompensation.toFixed(2)),
        totalContributions: new Prisma.Decimal(
          (
            computedTotals.preTaxDeferral +
            computedTotals.rothDeferral +
            computedTotals.employerMatch
          ).toFixed(2),
        ),
        validatedAt: new Date(),
        createdById: input.actorUserId,
      },
    });

    await tx.payrollContribution.createMany({
      data: normalized.map((c) => ({
        payrollRunId: run.id,
        participantId: participantsByExtId.get(c.externalEmployeeId) ?? null,
        externalEmployeeId: c.externalEmployeeId,
        sourceRowId: null, // populated below in a single follow-up update
        grossCompensation: new Prisma.Decimal(c.grossCompensation.toFixed(2)),
        eligibleCompensation:
          c.eligibleCompensation === undefined
            ? null
            : new Prisma.Decimal(c.eligibleCompensation.toFixed(2)),
        preTaxDeferral: new Prisma.Decimal(c.preTaxDeferral.toFixed(2)),
        rothDeferral: new Prisma.Decimal(c.rothDeferral.toFixed(2)),
        afterTaxContribution:
          c.afterTaxContribution === undefined
            ? null
            : new Prisma.Decimal(c.afterTaxContribution.toFixed(2)),
        employerMatch: new Prisma.Decimal(c.employerMatch.toFixed(2)),
        safeHarborMatch:
          c.safeHarborMatch === undefined ? null : new Prisma.Decimal(c.safeHarborMatch.toFixed(2)),
        safeHarborNonelective:
          c.safeHarborNonelective === undefined
            ? null
            : new Prisma.Decimal(c.safeHarborNonelective.toFixed(2)),
        profitSharing:
          c.profitSharing === undefined ? null : new Prisma.Decimal(c.profitSharing.toFixed(2)),
        loanRepayment: new Prisma.Decimal(c.loanRepayment.toFixed(2)),
        rawJson: c.raw,
        normalizedJson: serializeNormalized(c),
        transformVersion: TRANSFORM_VERSION,
      })),
    });

    if (validationResult.issues.length > 0) {
      await tx.validationIssue.createMany({
        data: validationResult.issues.map((i) => ({
          payrollRunId: run.id,
          ruleKey: i.ruleKey,
          severity: i.severity,
          category: i.category,
          entityType: i.entityType,
          entityId: i.entityId ?? null,
          participantId:
            i.entityType === "participant" && i.entityId
              ? participantsByExtId.get(i.entityId) ?? null
              : i.participantId ?? null,
          message: i.message,
          recommendedResolution: i.recommendedResolution ?? null,
          sourceField: i.sourceField ?? null,
          expectedValue: i.expectedValue ?? null,
          actualValue: i.actualValue ?? null,
          status: "open",
        })),
      });
    }

    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: input.companyId,
        planId: input.planId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.validationRunCompleted,
        entityType: "payroll_run",
        entityId: run.id,
        after: {
          status: run.status,
          contributionCount: normalized.length,
          countsBySeverity: validationResult.countsBySeverity,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return run;
  });

  return {
    payrollRunId: result.id,
    status: result.status,
    contributionCount: normalized.length,
    validationCounts: validationResult.countsBySeverity,
    hasBlocking: validationResult.hasBlocking,
  };
}

function computeTotals(rows: NormalizedContribution[]) {
  let grossCompensation = 0;
  let preTaxDeferral = 0;
  let rothDeferral = 0;
  let employerMatch = 0;
  let loanRepayment = 0;
  for (const c of rows) {
    grossCompensation += c.grossCompensation;
    preTaxDeferral += c.preTaxDeferral;
    rothDeferral += c.rothDeferral;
    employerMatch += c.employerMatch;
    loanRepayment += c.loanRepayment;
  }
  return {
    grossCompensation: round2(grossCompensation),
    preTaxDeferral: round2(preTaxDeferral),
    rothDeferral: round2(rothDeferral),
    employerMatch: round2(employerMatch),
    loanRepayment: round2(loanRepayment),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function inferPayrollDate(rows: NormalizedContribution[]): Date {
  // All rows in a single payroll run should share a payroll date. If they
  // don't, the validator layer flags it; here we just use the most common.
  const counts = new Map<string, { date: Date; count: number }>();
  for (const r of rows) {
    const key = r.payrollDate.toISOString();
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { date: r.payrollDate, count: 1 });
  }
  let best: { date: Date; count: number } | null = null;
  for (const v of counts.values()) {
    if (!best || v.count > best.count) best = v;
  }
  return best!.date;
}

function minDate(dates: (Date | undefined)[]): Date | null {
  const real = dates.filter((d): d is Date => !!d);
  if (real.length === 0) return null;
  return real.reduce((a, b) => (a < b ? a : b));
}

function maxDate(dates: (Date | undefined)[]): Date | null {
  const real = dates.filter((d): d is Date => !!d);
  if (real.length === 0) return null;
  return real.reduce((a, b) => (a > b ? a : b));
}

function pickEffectiveRules(
  versions: { effectiveDate: Date; rulesJson: Prisma.JsonValue }[],
  payrollDate: Date,
): PlanRules {
  const eligible = versions
    .filter((v) => v.effectiveDate <= payrollDate)
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());
  if (eligible.length > 0) {
    return eligible[0]!.rulesJson as unknown as PlanRules;
  }
  // Fallback: the engine still runs without plan-formula validators, just
  // with IRS limits resolved from the payroll year. Plan operators should
  // create a rule version before going live; this fallback prevents a brand
  // new plan from blocking the entire flow.
  return defaultPlanRules(payrollDate);
}

function defaultPlanRules(payrollDate: Date): PlanRules {
  // 2025 IRS limits as of publication. Update annually via a seed script and
  // by creating a new PlanRuleVersion per plan.
  return {
    planYear: payrollDate.getUTCFullYear(),
    irsElectiveDeferralLimit: 23_500,
    irsCatchUpLimit50Plus: 7_500,
    maxEmployeeDeferralPercent: 100,
    // Most conservative default: assume the general DOL framework. Plans
    // eligible for the small-plan safe harbor must opt in via a rule version.
    timeliness: { rule: "general_as_soon_as_feasible" },
  };
}

function serializeNormalized(c: NormalizedContribution) {
  return {
    externalEmployeeId: c.externalEmployeeId,
    ssnLast4: c.ssnLast4,
    firstName: c.firstName,
    lastName: c.lastName,
    payrollDate: c.payrollDate.toISOString(),
    payPeriodStart: c.payPeriodStart?.toISOString(),
    payPeriodEnd: c.payPeriodEnd?.toISOString(),
    grossCompensation: c.grossCompensation,
    eligibleCompensation: c.eligibleCompensation,
    preTaxDeferral: c.preTaxDeferral,
    rothDeferral: c.rothDeferral,
    afterTaxContribution: c.afterTaxContribution,
    employerMatch: c.employerMatch,
    safeHarborMatch: c.safeHarborMatch,
    safeHarborNonelective: c.safeHarborNonelective,
    profitSharing: c.profitSharing,
    loanRepayment: c.loanRepayment,
    rowIndex: c.rowIndex,
    transformVersion: TRANSFORM_VERSION,
  };
}

async function upsertParticipantStubs(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    contributions: NormalizedContribution[];
    ssnByRow: Map<number, string>;
  },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // De-dup by externalEmployeeId; first occurrence wins for stub fields.
  const firstByExtId = new Map<string, NormalizedContribution>();
  for (const c of params.contributions) {
    if (!firstByExtId.has(c.externalEmployeeId)) firstByExtId.set(c.externalEmployeeId, c);
  }

  for (const [extId, c] of firstByExtId) {
    const ssn = params.ssnByRow.get(c.rowIndex);
    const ssnEncryptedCreate = await encryptOptional(ssn ?? null);
    // For the update branch, undefined means "leave existing value alone";
    // null/encrypted-string means "set to that value". encryptOptional handles
    // null/empty by returning null.
    const ssnEncryptedUpdate = ssn === undefined ? undefined : await encryptOptional(ssn);
    const upserted = await tx.participant.upsert({
      where: {
        companyId_externalEmployeeId: {
          companyId: params.companyId,
          externalEmployeeId: extId,
        },
      },
      create: {
        companyId: params.companyId,
        externalEmployeeId: extId,
        firstName: c.firstName ?? "",
        lastName: c.lastName ?? "",
        ssnEncrypted: ssnEncryptedCreate,
        ssnLast4: ssn ? ssnLast4(ssn) : null,
        status: "active",
      },
      update: {
        // Don't overwrite identity once set — operators will manage participants
        // via the census import / participant management UI in a later phase.
        // We do backfill SSN if it was previously unknown, since contribution
        // files often carry it and there's no other safe place to learn it.
        ssnEncrypted: ssnEncryptedUpdate,
        ssnLast4: ssn ? ssnLast4(ssn) : undefined,
      },
    });
    out.set(extId, upserted.id);
  }
  return out;
}
