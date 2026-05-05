// Paycor sync orchestrator. Converts a sequence of adapter calls into
// persisted application state — Participants, PayrollSourceFiles,
// PayrollRuns, PayrollContributions, ValidationIssues — all flowing
// through the same validation engine + audit trail as CSV uploads.
//
// Flow:
//
//   1. getCompany   — capture / refresh provider company metadata.
//   2. getEmployees — upsert Participant rows by externalEmployeeId.
//   3. getPayrollRuns — iterate processed runs since the last sync.
//   4. getPayrollRunDetails — for each run, persist a synthetic
//      PayrollSourceFile (the adapter response as JSON), persist
//      SourceRow rows, and create the PayrollRun + Contributions +
//      ValidationIssues.
//   5. SyncJob row records start / completion / error for each invocation.
//
// Idempotency: each (PayrollConnection, externalPayrollRunId) is created
// at most once. Re-running the sync over an already-processed run is a
// no-op for that run; new runs in the window are picked up.
//
// CLAUDE.md §8.4 invariant honored: raw provider data is preserved
// verbatim in PayrollSourceFile + SourceRow, never silently mutated.

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { sha256Hex } from "@/lib/crypto/hashing";
import { encryptOptional, ssnLast4 } from "@/lib/crypto/encryption";
import { notFound } from "@/lib/errors";
import { adapterFor } from "@/lib/integrations/registry";
import type {
  PayrollProviderAdapter,
  ProviderContribution,
  ProviderEmployee,
  ProviderPayrollRunDetail,
} from "@/lib/integrations/types";
import { runValidators } from "@/lib/validation/engine";
import type {
  LoanScheduleSnapshot,
  ParticipantSnapshot,
  PlanRules,
  ValidationContext,
} from "@/lib/validation/types";
import { storage } from "@/lib/storage";
import { payrollSourceKey } from "@/lib/storage/keys";

const TRANSFORM_VERSION = "paycor-sync.v1";

export type SyncInput = {
  organizationId: string;
  connectionId: string;
  // Default: pick up where the last successful sync left off (most recent
  // PayrollRun.payrollDate for this connection's company), minus a small
  // overlap to catch late-corrected runs.
  since?: Date;
  // Operator-attribution. System-triggered syncs (cron) supply null.
  actorUserId?: string | null;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type SyncResult = {
  syncJobId: string;
  employeesUpserted: number;
  runsConsidered: number;
  runsCreated: number;
  runsSkipped: number; // already present, or status != "processed"
  payrollRunIds: string[];
};

export async function syncFromProvider(input: SyncInput): Promise<SyncResult> {
  // Load + scope-check the connection.
  const conn = await db.payrollConnection.findUnique({
    where: { id: input.connectionId },
    include: { company: { include: { plans: { take: 1, orderBy: { createdAt: "asc" } } } } },
  });
  if (!conn) throw notFound("Payroll connection");
  if (conn.company.organizationId !== input.organizationId) throw notFound("Payroll connection");
  if (conn.status !== "active") {
    throw new Error(`Connection ${conn.id} is in status "${conn.status}"; cannot sync`);
  }
  // The first plan on the company is the default destination for synced
  // runs. Multi-plan setups (e.g., Acme has a 401(k) and a 403(b)) need a
  // mapping table; deferred to Round 4.
  const plan = conn.company.plans[0];
  if (!plan) {
    throw new Error(`Company ${conn.companyId} has no plans; cannot sync`);
  }

  const adapter = adapterFor(conn.provider as Parameters<typeof adapterFor>[0]);

  // Open a SyncJob row (existing model).
  const syncJob = await db.syncJob.create({
    data: {
      companyId: conn.companyId,
      planId: plan.id,
      provider: conn.provider,
      status: "running",
      startedAt: new Date(),
      metadataJson: { connectionId: conn.id, since: input.since?.toISOString() ?? null },
    },
  });
  await writeAudit({
    organizationId: input.organizationId,
    companyId: conn.companyId,
    planId: plan.id,
    actorUserId: input.actorUserId ?? undefined,
    actorType: input.actorUserId ? "user" : "system",
    action: AUDIT_ACTIONS.payrollSyncStarted,
    entityType: "sync_job",
    entityId: syncJob.id,
    metadata: { connectionId: conn.id, provider: conn.provider },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });

  let result: SyncResult = {
    syncJobId: syncJob.id,
    employeesUpserted: 0,
    runsConsidered: 0,
    runsCreated: 0,
    runsSkipped: 0,
    payrollRunIds: [],
  };
  try {
    // 1. Census sync.
    const employees = await adapter.getEmployees(conn.id);
    const empIdByExt = await upsertParticipantsFromProvider({
      companyId: conn.companyId,
      employees,
    });
    result.employeesUpserted = employees.length;

    // 2. Determine the since-window.
    const since = input.since ?? (await defaultSinceForCompany(conn.companyId));

    // 3. Walk runs.
    const runs = await adapter.getPayrollRuns(conn.id, since ? { since } : undefined);
    result.runsConsidered = runs.length;

    const planRules = await pickEffectivePlanRules(plan.id);

    for (const run of runs) {
      if (run.status !== "processed") {
        result.runsSkipped += 1;
        continue;
      }
      const existing = await findExistingRun({
        companyId: conn.companyId,
        externalPayrollRunId: run.externalPayrollRunId,
      });
      if (existing) {
        result.runsSkipped += 1;
        continue;
      }

      const detail = await adapter.getPayrollRunDetails(conn.id, run.externalPayrollRunId);
      const created = await createPayrollRunFromAdapterDetail({
        organizationId: input.organizationId,
        companyId: conn.companyId,
        planId: plan.id,
        provider: conn.provider,
        connectionId: conn.id,
        actorUserId: input.actorUserId ?? null,
        detail,
        adapter,
        empIdByExt,
        planRules,
      });
      result.runsCreated += 1;
      result.payrollRunIds.push(created.payrollRunId);
    }

    await db.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        metadataJson: { ...result, since: since?.toISOString() ?? null },
      },
    });
    await writeAudit({
      organizationId: input.organizationId,
      companyId: conn.companyId,
      planId: plan.id,
      actorUserId: input.actorUserId ?? undefined,
      actorType: input.actorUserId ? "user" : "system",
      action: AUDIT_ACTIONS.payrollSyncCompleted,
      entityType: "sync_job",
      entityId: syncJob.id,
      metadata: result as unknown as Record<string, unknown>,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: message.slice(0, 4000),
      },
    });
    await writeAudit({
      organizationId: input.organizationId,
      companyId: conn.companyId,
      planId: plan.id,
      actorUserId: input.actorUserId ?? undefined,
      actorType: input.actorUserId ? "user" : "system",
      action: AUDIT_ACTIONS.payrollSyncFailed,
      entityType: "sync_job",
      entityId: syncJob.id,
      metadata: { errorMessage: message.slice(0, 1000), partial: result },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });
    throw err;
  }
}

// Returns externalEmployeeId → Participant.id map for use in the run-creation
// step. Identity fields aren't overwritten on existing rows (per the
// "never silently alter participant identity" invariant) but SSN +
// termination date are backfilled when the provider supplies them and the
// local row didn't have them.
async function upsertParticipantsFromProvider(params: {
  companyId: string;
  employees: ProviderEmployee[];
}): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const e of params.employees) {
    const ssnEnc = e.ssn ? await encryptOptional(e.ssn) : null;
    const upserted = await db.participant.upsert({
      where: {
        companyId_externalEmployeeId: {
          companyId: params.companyId,
          externalEmployeeId: e.externalEmployeeId,
        },
      },
      create: {
        companyId: params.companyId,
        externalEmployeeId: e.externalEmployeeId,
        firstName: e.firstName,
        lastName: e.lastName,
        ssnEncrypted: ssnEnc,
        ssnLast4: e.ssn ? ssnLast4(e.ssn) : null,
        dateOfHire: e.dateOfHire ?? null,
        dateOfTermination: e.dateOfTermination ?? null,
        status: e.status,
      },
      update: {
        // Census updates from a trusted provider can refresh status,
        // termination, and ssn-when-newly-known. Names + hire date stay
        // untouched once set — operators correct identity via the census
        // import / participant management UI.
        status: e.status,
        dateOfTermination: e.dateOfTermination ?? undefined,
        ssnEncrypted: ssnEnc ?? undefined,
        ssnLast4: e.ssn ? ssnLast4(e.ssn) : undefined,
      },
    });
    out.set(e.externalEmployeeId, upserted.id);
  }
  return out;
}

async function defaultSinceForCompany(companyId: string): Promise<Date | undefined> {
  // Last sync's most-recent run, minus 14 days of overlap so corrections
  // applied by the provider after the fact land on this side.
  const latest = await db.payrollRun.findFirst({
    where: { plan: { companyId }, sourceSystem: { not: "csv" } },
    orderBy: { payrollDate: "desc" },
    select: { payrollDate: true },
  });
  if (!latest) return undefined;
  const d = new Date(latest.payrollDate);
  d.setUTCDate(d.getUTCDate() - 14);
  return d;
}

async function findExistingRun(params: {
  companyId: string;
  externalPayrollRunId: string;
}) {
  // sourceFile.fileName carries the externalPayrollRunId (we set it that
  // way when persisting the synthetic source file), making this a cheap
  // lookup without adding another column.
  return db.payrollRun.findFirst({
    where: {
      plan: { companyId: params.companyId },
      sourceFile: { fileName: { contains: params.externalPayrollRunId } },
    },
    select: { id: true },
  });
}

async function pickEffectivePlanRules(planId: string): Promise<PlanRules | null> {
  const v = await db.planRuleVersion.findFirst({
    where: { planId, effectiveDate: { lte: new Date() } },
    orderBy: { effectiveDate: "desc" },
  });
  return v ? (v.rulesJson as PlanRules) : null;
}

async function createPayrollRunFromAdapterDetail(params: {
  organizationId: string;
  companyId: string;
  planId: string;
  provider: string;
  connectionId: string;
  actorUserId: string | null;
  detail: ProviderPayrollRunDetail;
  adapter: PayrollProviderAdapter;
  empIdByExt: Map<string, string>;
  planRules: PlanRules | null;
}): Promise<{ payrollRunId: string }> {
  const { detail } = params;

  // 1. Persist the adapter response as a synthetic SourceFile so the audit
  //    trail (and audit-package ZIP) carries the verbatim provider payload.
  const snapshotJson = JSON.stringify(detail, jsonReplacer, 2);
  const snapshotBytes = Buffer.from(snapshotJson, "utf8");
  const checksum = sha256Hex(snapshotBytes);
  const fileId = `sync-${detail.externalPayrollRunId}-${Date.now()}`;
  const fileName = `paycor-${detail.externalPayrollRunId}.json`;
  const storageKey = payrollSourceKey({
    companyId: params.companyId,
    fileId,
    fileName,
  });
  await storage().putObject({
    key: storageKey,
    body: snapshotBytes,
    contentType: "application/json",
  });

  // 2. Build canonical NormalizedContribution shapes for the validator.
  //    Adapters already produced canonical numeric fields; we only need
  //    to attach the in-memory shape the engine expects.
  const normalizedForValidation = detail.contributions.map((c, idx) => ({
    externalEmployeeId: c.externalEmployeeId,
    payrollDate: detail.payrollDate,
    payPeriodStart: detail.payPeriodStart,
    payPeriodEnd: detail.payPeriodEnd,
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
    raw: (c.rawJson ?? {}) as Record<string, string>,
    rowIndex: idx,
  }));

  // 3. Snapshot participants + loan schedules for cross-row validators.
  const [participantsRows, loanSchedulesRows] = await Promise.all([
    db.participant.findMany({
      where: { companyId: params.companyId },
      select: {
        id: true,
        externalEmployeeId: true,
        firstName: true,
        lastName: true,
        status: true,
        dateOfHire: true,
        dateOfTermination: true,
      },
    }),
    db.loanSchedule.findMany({
      where: { status: "active", participant: { companyId: params.companyId } },
      select: {
        id: true,
        participantId: true,
        loanNumber: true,
        expectedPaymentAmount: true,
        paymentFrequency: true,
        status: true,
        participant: { select: { externalEmployeeId: true } },
      },
    }),
  ]);
  const participants: ParticipantSnapshot[] = participantsRows
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
  const loanSchedules: LoanScheduleSnapshot[] = loanSchedulesRows
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

  const computedTotals = sumTotals(detail.contributions);
  const planRules = params.planRules ?? defaultPlanRules(detail.payrollDate);

  // 4. Run validators (header totals supplied as the computed sum — the
  //    provider IS the source of truth here, no separate operator-entered
  //    reconciliation step like with CSV uploads).
  const ctx: ValidationContext = {
    payrollRunId: "",
    payrollDate: detail.payrollDate,
    contributions: normalizedForValidation,
    totals: computedTotals,
    rules: planRules,
    participants,
    loanSchedules,
  };
  const validationResult = runValidators(ctx);

  // 5. Persist everything in one transaction.
  const result = await db.$transaction(async (tx) => {
    const sourceFile = await tx.payrollSourceFile.create({
      data: {
        id: fileId,
        companyId: params.companyId,
        fileName,
        storageKey,
        checksum,
        mimeType: "application/json",
        sizeBytes: snapshotBytes.length,
        importType: "contribution",
        uploadedById: params.actorUserId,
        status: "parsed",
        // Provider-synced JSON is not user-uploaded content; mark the scan
        // as skipped with provider-sync attribution so downstream gates
        // accept it without an operator override.
        scanStatus: "skipped",
        scanProvider: "provider_sync",
        scanCompletedAt: new Date(),
      },
    });

    if (detail.contributions.length > 0) {
      await tx.sourceRow.createMany({
        data: detail.contributions.map((c, idx) => ({
          sourceFileId: sourceFile.id,
          rowIndex: idx,
          rawJson: (c.rawJson ?? {}) as Prisma.InputJsonValue,
        })),
      });
    }

    const run = await tx.payrollRun.create({
      data: {
        planId: params.planId,
        payrollDate: detail.payrollDate,
        payPeriodStart: detail.payPeriodStart ?? null,
        payPeriodEnd: detail.payPeriodEnd ?? null,
        status: validationResult.hasBlocking ? "exception_review" : "validated",
        sourceSystem: params.provider,
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
        createdById: params.actorUserId,
      },
    });

    await tx.payrollContribution.createMany({
      data: detail.contributions.map((c) => ({
        payrollRunId: run.id,
        participantId: params.empIdByExt.get(c.externalEmployeeId) ?? null,
        externalEmployeeId: c.externalEmployeeId,
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
        rawJson: (c.rawJson ?? {}) as Prisma.InputJsonValue,
        normalizedJson: serializeNormalized(c, detail) as Prisma.InputJsonValue,
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
              ? params.empIdByExt.get(i.entityId) ?? null
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
        organizationId: params.organizationId,
        companyId: params.companyId,
        planId: params.planId,
        actorUserId: params.actorUserId ?? undefined,
        actorType: params.actorUserId ? "user" : "system",
        action: AUDIT_ACTIONS.validationRunCompleted,
        entityType: "payroll_run",
        entityId: run.id,
        after: {
          status: run.status,
          contributionCount: detail.contributions.length,
          countsBySeverity: validationResult.countsBySeverity,
          provider: params.provider,
          externalPayrollRunId: detail.externalPayrollRunId,
        },
      },
      tx,
    );

    return run;
  });

  return { payrollRunId: result.id };
}

function sumTotals(rows: ProviderContribution[]) {
  let g = 0, p = 0, r = 0, m = 0, l = 0;
  for (const c of rows) {
    g += c.grossCompensation;
    p += c.preTaxDeferral;
    r += c.rothDeferral;
    m += c.employerMatch;
    l += c.loanRepayment;
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    grossCompensation: round2(g),
    preTaxDeferral: round2(p),
    rothDeferral: round2(r),
    employerMatch: round2(m),
    loanRepayment: round2(l),
  };
}

function defaultPlanRules(payrollDate: Date): PlanRules {
  return {
    planYear: payrollDate.getUTCFullYear(),
    irsElectiveDeferralLimit: 23_500,
    irsCatchUpLimit50Plus: 7_500,
    maxEmployeeDeferralPercent: 100,
    timeliness: { rule: "general_as_soon_as_feasible" },
  };
}

function serializeNormalized(c: ProviderContribution, detail: ProviderPayrollRunDetail) {
  return {
    externalEmployeeId: c.externalEmployeeId,
    payrollDate: detail.payrollDate.toISOString(),
    payPeriodStart: detail.payPeriodStart?.toISOString(),
    payPeriodEnd: detail.payPeriodEnd?.toISOString(),
    grossCompensation: c.grossCompensation,
    preTaxDeferral: c.preTaxDeferral,
    rothDeferral: c.rothDeferral,
    employerMatch: c.employerMatch,
    loanRepayment: c.loanRepayment,
    transformVersion: TRANSFORM_VERSION,
  };
}

// Stable JSON serialization for the source-file snapshot. Dates → ISO so
// the persisted bytes survive process roundtrips.
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}
