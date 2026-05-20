// Integration tests for the incident-management service. Skipped by
// default; run with: RUN_DB_INTEGRATION_TESTS=1 npm test

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addIncidentNote,
  closeIncident,
  openIncident,
  recordCustomerNotificationDecision,
  transitionIncidentStatus,
} from "@/lib/services/incident";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("incident service", () => {
  const prisma = new PrismaClient();
  let orgId: string;
  let adminId: string;
  const cleanupIds: string[] = [];

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "Incident Test Org", slug: `inc-test-${Date.now()}` },
    });
    orgId = org.id;
    const admin = await prisma.user.create({
      data: { email: `inc-admin-${Date.now()}@example.test`, status: "active" },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    for (const id of cleanupIds) {
      await prisma.incident.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: adminId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("opens an incident in 'open' status with an initial status_change update", async () => {
    const r = await openIncident({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      organizationId: orgId,
      incidentType: "security",
      severity: "high",
      title: "Suspicious API request burst",
      description: "Rate-limit triggered on /api/payroll-runs from a new IP.",
      detectedAt: new Date(),
    });
    cleanupIds.push(r.incidentId);

    const inc = await prisma.incident.findUniqueOrThrow({
      where: { id: r.incidentId },
      include: { updates: true },
    });
    expect(inc.status).toBe("open");
    expect(inc.updates.length).toBe(1);
    expect(inc.updates[0]!.kind).toBe("status_change");
    expect(inc.updates[0]!.toStatus).toBe("open");
  });

  it("refuses an empty title or description", async () => {
    await expect(
      openIncident({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        organizationId: orgId,
        incidentType: "security",
        severity: "low",
        title: "   ",
        description: "x",
        detectedAt: new Date(),
      }),
    ).rejects.toThrow(/title/i);
  });

  it("transitions forward through the lifecycle but refuses backwards", async () => {
    const r = await openIncident({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      organizationId: orgId,
      incidentType: "availability",
      severity: "medium",
      title: "DB slow queries",
      description: "p95 latency above 800ms",
      detectedAt: new Date(),
    });
    cleanupIds.push(r.incidentId);

    await transitionIncidentStatus({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      incidentId: r.incidentId,
      toStatus: "contained",
    });
    await transitionIncidentStatus({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      incidentId: r.incidentId,
      toStatus: "resolved",
    });

    // Going back is refused.
    await expect(
      transitionIncidentStatus({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        incidentId: r.incidentId,
        toStatus: "contained",
      }),
    ).rejects.toThrow(/cannot transition/i);
  });

  it("refuses notes on a closed incident", async () => {
    const r = await openIncident({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      organizationId: orgId,
      incidentType: "data_integrity",
      severity: "low",
      title: "Off-by-one in report",
      description: "Report excluded the last row",
      detectedAt: new Date(),
    });
    cleanupIds.push(r.incidentId);

    await closeIncident({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      incidentId: r.incidentId,
      rootCause: "off-by-one in pagination cursor",
      containmentActions: "hotfix deployed",
      resolutionActions: "report re-run and verified",
    });

    await expect(
      addIncidentNote({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        incidentId: r.incidentId,
        note: "follow up",
      }),
    ).rejects.toThrow(/closed/i);
  });

  it("close refuses without the full narrative", async () => {
    const r = await openIncident({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      organizationId: orgId,
      incidentType: "security",
      severity: "low",
      title: "Phishing report",
      description: "User reported suspicious email",
      detectedAt: new Date(),
    });
    cleanupIds.push(r.incidentId);

    await expect(
      closeIncident({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        incidentId: r.incidentId,
        rootCause: "",
        containmentActions: "x",
        resolutionActions: "y",
      }),
    ).rejects.toThrow(/rootCause/i);
  });

  it("captures customer-notification decision with required reasoning", async () => {
    const r = await openIncident({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      organizationId: orgId,
      incidentType: "privacy",
      severity: "high",
      title: "PII exposure suspected",
      description: "Vuln in log redaction",
      detectedAt: new Date(),
    });
    cleanupIds.push(r.incidentId);

    await expect(
      recordCustomerNotificationDecision({
        actorUserId: adminId,
        actorOrganizationId: orgId,
        incidentId: r.incidentId,
        required: true,
        notes: "   ",
      }),
    ).rejects.toThrow(/reasoning/i);

    await recordCustomerNotificationDecision({
      actorUserId: adminId,
      actorOrganizationId: orgId,
      incidentId: r.incidentId,
      required: true,
      notes: "29 CFR 2520 + customer contract requires notification within 72h",
    });

    const inc = await prisma.incident.findUniqueOrThrow({ where: { id: r.incidentId } });
    expect(inc.customerNotificationRequired).toBe(true);
    expect(inc.customerNotificationDecidedAt).not.toBeNull();
  });
});
