// Integration test for approval invalidation. Skipped by default; enable with
// RUN_DB_INTEGRATION_TESTS=1.

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invalidateApprovalIfActive } from "@/lib/services/approval-invalidation";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("invalidateApprovalIfActive", () => {
  const prisma = new PrismaClient();
  const ids: { orgId?: string; companyId?: string; planId?: string; runId?: string; approvalId?: string } = {};

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "Inv Test Org", slug: `inv-test-${Date.now()}` },
    });
    ids.orgId = org.id;
    const company = await prisma.company.create({
      data: { organizationId: org.id, name: "Inv Test Co" },
    });
    ids.companyId = company.id;
    const plan = await prisma.plan.create({
      data: { companyId: company.id, name: "Inv Test Plan" },
    });
    ids.planId = plan.id;
    const run = await prisma.payrollRun.create({
      data: {
        planId: plan.id,
        payrollDate: new Date("2026-04-15"),
        sourceSystem: "csv",
        status: "approved",
        approvedAt: new Date(),
      },
    });
    ids.runId = run.id;
    // Need a real user to satisfy approvedById not-null constraint? No — approvedById is optional in current schema.
    const user = await prisma.user.create({
      data: { email: `inv-test-${Date.now()}@local`, name: "Approver" },
    });
    const approval = await prisma.approvalRecord.create({
      data: {
        payrollRunId: run.id,
        approvedById: user.id,
        certificationText: "test",
        totalsSnapshotJson: {},
        exceptionsAcknowledgedJson: [],
      },
    });
    ids.approvalId = approval.id;
  });

  afterAll(async () => {
    if (ids.runId) await prisma.payrollRun.delete({ where: { id: ids.runId } }).catch(() => undefined);
    if (ids.planId) await prisma.plan.delete({ where: { id: ids.planId } }).catch(() => undefined);
    if (ids.companyId) await prisma.company.delete({ where: { id: ids.companyId } }).catch(() => undefined);
    if (ids.orgId) await prisma.organization.delete({ where: { id: ids.orgId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("flips the run back to exception_review and stamps invalidatedAt", async () => {
    if (!ids.orgId || !ids.companyId || !ids.planId || !ids.runId || !ids.approvalId) {
      throw new Error("setup failed");
    }
    const result = await prisma.$transaction((tx) =>
      invalidateApprovalIfActive(tx, {
        organizationId: ids.orgId!,
        companyId: ids.companyId!,
        planId: ids.planId!,
        actorUserId: "system",
        payrollRunId: ids.runId!,
        reason: "test",
      }),
    );
    expect(result.invalidated).toBe(true);
    expect(result.approvalRecordIds).toContain(ids.approvalId);

    const run = await prisma.payrollRun.findUnique({ where: { id: ids.runId } });
    expect(run?.status).toBe("exception_review");
    expect(run?.approvalInvalidatedAt).not.toBeNull();

    const approval = await prisma.approvalRecord.findUnique({ where: { id: ids.approvalId } });
    expect(approval?.invalidatedAt).not.toBeNull();
    expect(approval?.invalidationReason).toBe("test");
  });

  it("is a no-op when called twice", async () => {
    if (!ids.orgId || !ids.companyId || !ids.planId || !ids.runId) throw new Error("setup failed");
    const result = await prisma.$transaction((tx) =>
      invalidateApprovalIfActive(tx, {
        organizationId: ids.orgId!,
        companyId: ids.companyId!,
        planId: ids.planId!,
        actorUserId: "system",
        payrollRunId: ids.runId!,
        reason: "second",
      }),
    );
    expect(result.invalidated).toBe(false);
  });
});
