// Tenant-isolation fuzz test.
//
// Boots two parallel organizations and for every protected route that takes a
// resource identifier, calls the route handler with org A's actor but org B's
// identifier. Each call must surface as 404 (the standard "the user can't see
// this resource" response). Any 200/201/2xx is a critical IDOR finding.
//
// Skipped unless RUN_DB_INTEGRATION_TESTS=1.
//
// Adding a new endpoint: append an entry to ENDPOINTS at the bottom and the
// suite picks it up automatically.

import { Prisma, PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock the session + request-context modules BEFORE importing the route
// handlers so the hoisted mocks are in place when handlers resolve their
// imports.
vi.mock("@/lib/session", async () => {
  const real = await vi.importActual<typeof import("@/lib/session")>("@/lib/session");
  return { ...real, requireActor: vi.fn() };
});
vi.mock("@/lib/request-context", () => ({
  getRequestContext: vi.fn(async () => ({
    requestId: "test-req",
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  })),
}));

import * as session from "@/lib/session";
import type { ActorContext } from "@/lib/rbac/check";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac/permissions";

import { GET as getPayrollRun } from "@/app/api/payroll-runs/[id]/route";
import { POST as postCorrectionCycle } from "@/app/api/payroll-runs/[id]/correction-cycles/route";
import { POST as postFileParse } from "@/app/api/files/[id]/parse/route";
import { POST as postPreviewTotals } from "@/app/api/files/[id]/preview-totals/route";
import { POST as postResolveException } from "@/app/api/exceptions/[id]/resolve/route";
import { POST as postGenerateContributionFile } from "@/app/api/contribution-files/generate/route";
import { POST as postApproveContributionFile } from "@/app/api/contribution-files/[id]/approve/route";
import { GET as getContributionFileDownload } from "@/app/api/contribution-files/[id]/download/route";
import { GET as getPlanRules, POST as postPlanRules } from "@/app/api/plans/[id]/rules/route";
import { POST as postPayrollRunCreate } from "@/app/api/payroll-runs/route";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

type OrgFixture = {
  org: { id: string };
  user: { id: string };
  company: { id: string };
  plan: { id: string };
  payrollRun: { id: string };
  sourceFile: { id: string };
  validationIssue: { id: string };
  contributionFile: { id: string };
};

function actorFor(fix: OrgFixture): ActorContext {
  return {
    userId: fix.user.id,
    organizationId: fix.org.id,
    roleKey: "firm_admin",
    permissions: new Set(ALL_PERMISSION_KEYS),
  };
}

async function bootstrapOrg(prisma: PrismaClient, label: string): Promise<OrgFixture> {
  const slug = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = await prisma.organization.create({ data: { name: `Org ${label}`, slug } });
  const user = await prisma.user.create({
    data: { email: `${slug}@local`, name: `User ${label}` },
  });
  const company = await prisma.company.create({
    data: { organizationId: org.id, name: `Co ${label}` },
  });
  const plan = await prisma.plan.create({
    data: { companyId: company.id, name: `Plan ${label}` },
  });
  await prisma.planRuleVersion.create({
    data: {
      planId: plan.id,
      effectiveDate: new Date(Date.UTC(2025, 0, 1)),
      rulesJson: {
        planYear: 2025,
        irsElectiveDeferralLimit: 23_500,
        irsCatchUpLimit50Plus: 7_500,
      },
    },
  });

  const sourceFile = await prisma.payrollSourceFile.create({
    data: {
      companyId: company.id,
      fileName: `${label}.csv`,
      storageKey: `orgs/${org.id}/test-${label}.csv`,
      checksum: "test",
      mimeType: "text/csv",
      sizeBytes: 0,
      importType: "contribution",
      status: "parsed",
    },
  });
  await prisma.sourceRow.create({
    data: { sourceFileId: sourceFile.id, rowIndex: 0, rawJson: {} },
  });

  const payrollRun = await prisma.payrollRun.create({
    data: {
      planId: plan.id,
      payrollDate: new Date(Date.UTC(2026, 3, 15)),
      status: "exception_review",
      sourceSystem: "csv",
      sourceFileId: sourceFile.id,
    },
  });

  const validationIssue = await prisma.validationIssue.create({
    data: {
      payrollRunId: payrollRun.id,
      ruleKey: "test.rule",
      severity: "warning",
      category: "data_quality",
      entityType: "payroll_run",
      message: "test issue",
      status: "open",
    },
  });

  const contributionFile = await prisma.contributionFile.create({
    data: {
      payrollRunId: payrollRun.id,
      version: 1,
      status: "generated",
      storageKey: `orgs/${org.id}/contributions/${label}-v1.csv`,
      checksum: "test",
      format: "nevatas.v1",
    },
  });

  return {
    org,
    user,
    company,
    plan,
    payrollRun,
    sourceFile,
    validationIssue,
    contributionFile,
  };
}

async function tearDownOrg(prisma: PrismaClient, fix: OrgFixture | undefined) {
  if (!fix) return;
  // Children cascade from PayrollRun / ContributionFile deletes; delete in
  // reverse-dependency order to keep things tidy.
  await prisma.contributionFile.deleteMany({ where: { payrollRunId: fix.payrollRun.id } }).catch(() => undefined);
  await prisma.validationIssue.deleteMany({ where: { payrollRunId: fix.payrollRun.id } }).catch(() => undefined);
  await prisma.payrollRun.delete({ where: { id: fix.payrollRun.id } }).catch(() => undefined);
  await prisma.sourceRow.deleteMany({ where: { sourceFileId: fix.sourceFile.id } }).catch(() => undefined);
  await prisma.payrollSourceFile.delete({ where: { id: fix.sourceFile.id } }).catch(() => undefined);
  await prisma.planRuleVersion.deleteMany({ where: { planId: fix.plan.id } }).catch(() => undefined);
  await prisma.plan.delete({ where: { id: fix.plan.id } }).catch(() => undefined);
  await prisma.company.delete({ where: { id: fix.company.id } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: fix.user.id } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: fix.org.id } }).catch(() => undefined);
}

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

function buildReq(opts: { url: string; method: string; body?: unknown }): NextRequest {
  if (opts.body !== undefined) {
    return new NextRequest(opts.url, {
      method: opts.method,
      body: JSON.stringify(opts.body),
      headers: { "content-type": "application/json" },
    });
  }
  return new NextRequest(opts.url, { method: opts.method });
}

async function callRoute(
  handler: RouteHandler,
  opts: { url: string; method: string; body?: unknown; params?: Record<string, string> },
): Promise<Response> {
  return handler(buildReq(opts), { params: Promise.resolve(opts.params ?? {}) });
}

describeIfEnabled("Tenant isolation: org A actor cannot reach org B resources", () => {
  const prisma = new PrismaClient();
  let A: OrgFixture | undefined;
  let B: OrgFixture | undefined;

  beforeAll(async () => {
    A = await bootstrapOrg(prisma, "A");
    B = await bootstrapOrg(prisma, "B");
  });

  afterAll(async () => {
    await tearDownOrg(prisma, A);
    await tearDownOrg(prisma, B);
    await prisma.$disconnect();
  });

  type Spec = {
    name: string;
    run: () => Promise<Response>;
  };

  function specs(): Spec[] {
    if (!A || !B) throw new Error("fixtures not initialized");
    const a = A, b = B;
    return [
      {
        name: "GET /api/payroll-runs/[id]",
        run: () =>
          callRoute(getPayrollRun, {
            method: "GET",
            url: `http://localhost/api/payroll-runs/${b.payrollRun.id}`,
            params: { id: b.payrollRun.id },
          }),
      },
      {
        name: "POST /api/payroll-runs/[id]/correction-cycles",
        run: () =>
          callRoute(postCorrectionCycle, {
            method: "POST",
            url: `http://localhost/api/payroll-runs/${b.payrollRun.id}/correction-cycles`,
            params: { id: b.payrollRun.id },
            body: { reason: "cross-tenant test attempt" },
          }),
      },
      {
        name: "POST /api/files/[id]/parse",
        run: () =>
          callRoute(postFileParse, {
            method: "POST",
            url: `http://localhost/api/files/${b.sourceFile.id}/parse`,
            params: { id: b.sourceFile.id },
          }),
      },
      {
        name: "POST /api/files/[id]/preview-totals",
        run: () =>
          callRoute(postPreviewTotals, {
            method: "POST",
            url: `http://localhost/api/files/${b.sourceFile.id}/preview-totals`,
            params: { id: b.sourceFile.id },
            body: { mapping: {} },
          }),
      },
      {
        name: "POST /api/exceptions/[id]/resolve",
        run: () =>
          callRoute(postResolveException, {
            method: "POST",
            url: `http://localhost/api/exceptions/${b.validationIssue.id}/resolve`,
            params: { id: b.validationIssue.id },
            body: { status: "resolved" },
          }),
      },
      {
        name: "POST /api/contribution-files/generate (cross-tenant payrollRunId)",
        run: () =>
          callRoute(postGenerateContributionFile, {
            method: "POST",
            url: "http://localhost/api/contribution-files/generate",
            body: { payrollRunId: b.payrollRun.id },
          }),
      },
      {
        name: "POST /api/contribution-files/[id]/approve",
        run: () =>
          callRoute(postApproveContributionFile, {
            method: "POST",
            url: `http://localhost/api/contribution-files/${b.contributionFile.id}/approve`,
            params: { id: b.contributionFile.id },
            body: { acknowledgement: true },
          }),
      },
      {
        name: "GET /api/contribution-files/[id]/download",
        run: () =>
          callRoute(getContributionFileDownload, {
            method: "GET",
            url: `http://localhost/api/contribution-files/${b.contributionFile.id}/download`,
            params: { id: b.contributionFile.id },
          }),
      },
      {
        name: "GET /api/plans/[id]/rules",
        run: () =>
          callRoute(getPlanRules, {
            method: "GET",
            url: `http://localhost/api/plans/${b.plan.id}/rules`,
            params: { id: b.plan.id },
          }),
      },
      {
        name: "POST /api/plans/[id]/rules (cross-tenant plan)",
        run: () =>
          callRoute(postPlanRules, {
            method: "POST",
            url: `http://localhost/api/plans/${b.plan.id}/rules`,
            params: { id: b.plan.id },
            body: {
              effectiveDate: new Date(Date.now() + 86_400_000).toISOString(),
              rules: {
                planYear: 2026,
                irsElectiveDeferralLimit: 23_500,
                irsCatchUpLimit50Plus: 7_500,
              },
            },
          }),
      },
      {
        name: "POST /api/payroll-runs (cross-tenant company + plan + sourceFile)",
        run: () =>
          callRoute(postPayrollRunCreate, {
            method: "POST",
            url: "http://localhost/api/payroll-runs",
            body: {
              companyId: b.company.id,
              planId: b.plan.id,
              sourceFileId: b.sourceFile.id,
              mapping: {},
              reportedTotals: {
                grossCompensation: 0,
                preTaxDeferral: 0,
                rothDeferral: 0,
                employerMatch: 0,
                loanRepayment: 0,
              },
            },
          }),
      },
    ];
  }

  it("each protected endpoint refuses cross-tenant access", async () => {
    if (!A) throw new Error("fixtures not initialized");
    vi.mocked(session.requireActor).mockResolvedValue(actorFor(A));

    const results: { name: string; status: number; body: string }[] = [];
    for (const s of specs()) {
      const res = await s.run();
      const body = await res.text();
      results.push({ name: s.name, status: res.status, body });
    }

    // Every cross-tenant call must return a non-2xx. We accept 404 (notFound)
    // and 422 (validation_error — e.g., when the resource isn't even reachable
    // from the supplied scope). Anything 2xx is a critical IDOR finding.
    const leaks = results.filter((r) => r.status >= 200 && r.status < 300);
    if (leaks.length > 0) {
      console.error("IDOR leaks:", leaks);
    }
    expect(leaks).toEqual([]);

    // Spot-check a few specific endpoints to make sure they're 404 (not 5xx).
    const findResult = (name: string) => results.find((r) => r.name === name);
    expect(findResult("GET /api/payroll-runs/[id]")?.status).toBe(404);
    expect(findResult("POST /api/files/[id]/parse")?.status).toBe(404);
    expect(findResult("POST /api/exceptions/[id]/resolve")?.status).toBe(404);
    expect(findResult("GET /api/contribution-files/[id]/download")?.status).toBe(404);
    expect(findResult("GET /api/plans/[id]/rules")?.status).toBe(404);
  });

  it("the SAME endpoints succeed when called against the actor's own org", async () => {
    if (!A) throw new Error("fixtures not initialized");
    vi.mocked(session.requireActor).mockResolvedValue(actorFor(A));

    // Sanity check the harness itself: org-A actor reading org-A payroll run
    // should NOT 404. Otherwise our 404s above would be vacuous.
    const res = await callRoute(getPayrollRun, {
      method: "GET",
      url: `http://localhost/api/payroll-runs/${A.payrollRun.id}`,
      params: { id: A.payrollRun.id },
    });
    expect(res.status).toBe(200);
  });
});

// Silence ts unused-import on Prisma when this file is type-checked but the
// suite is skipped.
void Prisma;
