// End-to-end coverage for the Paycor sync orchestrator. Skipped by default;
// enable with RUN_DB_INTEGRATION_TESTS=1.
//
// These tests run against the deterministic mock adapter (PAYCOR_DRIVER=mock
// is the default). They exercise the full pipeline:
//   adapter → upsert participants → upsert payroll runs → contributions →
//   validation issues → audit events → sync job lifecycle

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { syncFromProvider } from "@/lib/services/paycor-sync";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("Paycor sync (mock adapter) end-to-end", () => {
  const prisma = new PrismaClient();
  const ids: { orgId?: string; companyId?: string; planId?: string; connId?: string } = {};
  const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    process.env.PAYCOR_DRIVER = "mock";
    process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER ?? "local";

    const org = await prisma.organization.create({
      data: { name: `PaycorSync Org ${uniq}`, slug: `paycor-sync-${uniq}` },
    });
    ids.orgId = org.id;
    const company = await prisma.company.create({
      data: { organizationId: org.id, name: `PaycorSync Co ${uniq}` },
    });
    ids.companyId = company.id;
    const plan = await prisma.plan.create({
      data: {
        companyId: company.id,
        name: `PaycorSync Plan ${uniq}`,
        planNumber: "001",
      },
    });
    ids.planId = plan.id;

    // Effective rule version covering 2026 payroll dates.
    await prisma.planRuleVersion.create({
      data: {
        planId: plan.id,
        effectiveDate: new Date(Date.UTC(2026, 0, 1)),
        rulesJson: {
          planYear: 2026,
          irsElectiveDeferralLimit: 23_500,
          irsCatchUpLimit50Plus: 7_500,
          maxEmployeeDeferralPercent: 100,
          matchFormula: {
            type: "tiered",
            tiers: [
              { upToPercent: 3, matchPercent: 100 },
              { upToPercent: 5, matchPercent: 50 },
            ],
          },
          eligibility: { minServiceMonths: 12 },
          timeliness: { rule: "small_plan_safe_harbor_7_business_days" },
          participantCount: 25,
        },
      },
    });

    const conn = await prisma.payrollConnection.create({
      data: {
        companyId: company.id,
        provider: "paycor",
        status: "active",
        settingsJson: { driver: "mock" },
      },
    });
    ids.connId = conn.id;
  });

  afterAll(async () => {
    if (ids.companyId) {
      await prisma.payrollContribution.deleteMany({
        where: { payrollRun: { plan: { companyId: ids.companyId } } },
      }).catch(() => undefined);
      await prisma.validationIssue.deleteMany({
        where: { payrollRun: { plan: { companyId: ids.companyId } } },
      }).catch(() => undefined);
      await prisma.payrollRun.deleteMany({
        where: { plan: { companyId: ids.companyId } },
      }).catch(() => undefined);
      await prisma.sourceRow.deleteMany({
        where: { sourceFile: { companyId: ids.companyId } },
      }).catch(() => undefined);
      await prisma.payrollSourceFile.deleteMany({
        where: { companyId: ids.companyId },
      }).catch(() => undefined);
      await prisma.syncJob.deleteMany({ where: { companyId: ids.companyId } }).catch(() => undefined);
      await prisma.loanSchedule.deleteMany({
        where: { participant: { companyId: ids.companyId } },
      }).catch(() => undefined);
      await prisma.participant.deleteMany({ where: { companyId: ids.companyId } }).catch(() => undefined);
      await prisma.payrollConnection.deleteMany({ where: { companyId: ids.companyId } }).catch(() => undefined);
      await prisma.planRuleVersion.deleteMany({ where: { plan: { companyId: ids.companyId } } }).catch(() => undefined);
      await prisma.plan.deleteMany({ where: { companyId: ids.companyId } }).catch(() => undefined);
      await prisma.company.delete({ where: { id: ids.companyId } }).catch(() => undefined);
    }
    if (ids.orgId) await prisma.organization.delete({ where: { id: ids.orgId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("syncs employees, payroll runs, and contributions in one pass", async () => {
    if (!ids.orgId || !ids.connId) throw new Error("setup failed");
    const result = await syncFromProvider({
      organizationId: ids.orgId,
      connectionId: ids.connId,
    });

    expect(result.employeesUpserted).toBe(8);
    // Mock has 3 runs; only 2 are processed (PR-2026-08, PR-2026-09).
    // PR-2026-10 is "draft" → skipped.
    expect(result.runsConsidered).toBe(3);
    expect(result.runsCreated).toBe(2);
    expect(result.runsSkipped).toBe(1);

    const runs = await prisma.payrollRun.findMany({
      where: { plan: { companyId: ids.companyId } },
      orderBy: { payrollDate: "asc" },
    });
    expect(runs.length).toBe(2);
    expect(runs.every((r) => r.sourceSystem === "paycor")).toBe(true);
  });

  it("re-running sync is idempotent — already-ingested runs are skipped", async () => {
    if (!ids.orgId || !ids.connId) throw new Error("setup failed");
    const before = await prisma.payrollRun.count({
      where: { plan: { companyId: ids.companyId } },
    });
    const result = await syncFromProvider({
      organizationId: ids.orgId,
      connectionId: ids.connId,
    });
    const after = await prisma.payrollRun.count({
      where: { plan: { companyId: ids.companyId } },
    });
    expect(after).toBe(before);
    expect(result.runsCreated).toBe(0);
    expect(result.runsSkipped).toBe(3); // all three considered, none created
  });

  it("validation engine fires expected issues on synced data (terminated-with-deferral, match-mismatch)", async () => {
    if (!ids.companyId) throw new Error("setup failed");
    const issues = await prisma.validationIssue.findMany({
      where: { payrollRun: { plan: { companyId: ids.companyId } } },
      select: { ruleKey: true },
    });
    const keys = new Set(issues.map((i) => i.ruleKey));
    // PE0006 terminated 2026-03-31 + has $60 deferral on 2026-04-15 run
    expect(keys.has("eligibility.terminated_with_deferral")).toBe(true);
    // PE0004 has wrong match (100 vs 175 expected) on 2026-04-15 run
    expect(keys.has("employer_match.formula_mismatch")).toBe(true);
  });

  it("preserves the adapter response verbatim as a synthetic source file", async () => {
    if (!ids.companyId) throw new Error("setup failed");
    const sourceFiles = await prisma.payrollSourceFile.findMany({
      where: { companyId: ids.companyId },
      select: { fileName: true, mimeType: true, scanStatus: true },
    });
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(sourceFiles.every((f) => f.mimeType === "application/json")).toBe(true);
    expect(sourceFiles.every((f) => f.fileName.startsWith("paycor-"))).toBe(true);
    // Provider-synced JSON skips the malware scan with provider-sync
    // attribution — operator can still override if their threat model demands.
    expect(sourceFiles.every((f) => f.scanStatus === "skipped")).toBe(true);
  });

  it("records SyncJob lifecycle (started → completed) with metadata", async () => {
    if (!ids.companyId) throw new Error("setup failed");
    const jobs = await prisma.syncJob.findMany({
      where: { companyId: ids.companyId },
      orderBy: { createdAt: "asc" },
    });
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    expect(jobs.every((j) => j.provider === "paycor")).toBe(true);
    expect(jobs.every((j) => j.status === "completed")).toBe(true);
  });
});
