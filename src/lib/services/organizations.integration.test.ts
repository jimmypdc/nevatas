// Integration coverage for the org-switch service. Skipped by default;
// enable with RUN_DB_INTEGRATION_TESTS=1.

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/lib/crypto/hashing";

// Mock the cookie writer so we don't need a Next.js request context.
vi.mock("@/lib/session", async () => {
  const real = await vi.importActual<typeof import("@/lib/session")>("@/lib/session");
  return { ...real, setActiveOrganizationId: vi.fn(async () => undefined) };
});

import * as session from "@/lib/session";
import {
  listMembershipsForUser,
  switchActiveOrganization,
} from "@/lib/services/organizations";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("org switching", () => {
  const prisma = new PrismaClient();
  const ids: { userId?: string; orgAId?: string; orgBId?: string; orgCId?: string } = {};
  const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    const role = await prisma.role.findFirstOrThrow({ where: { key: "firm_admin" } });
    const user = await prisma.user.create({
      data: {
        email: `multi-${uniq}@local`,
        name: "Multi-Org",
        passwordHash: await hashPassword("MultiOrgPasswordOk!1"),
        emailVerified: new Date(),
      },
    });
    ids.userId = user.id;

    const orgA = await prisma.organization.create({
      data: { name: `Org A ${uniq}`, slug: `org-a-${uniq}` },
    });
    const orgB = await prisma.organization.create({
      data: { name: `Org B ${uniq}`, slug: `org-b-${uniq}` },
    });
    const orgC = await prisma.organization.create({
      data: { name: `Org C ${uniq}`, slug: `org-c-${uniq}` },
    });
    ids.orgAId = orgA.id;
    ids.orgBId = orgB.id;
    ids.orgCId = orgC.id;

    // Active in A and B; deliberately NOT a member of C.
    await prisma.organizationUser.createMany({
      data: [
        { organizationId: orgA.id, userId: user.id, roleId: role.id, status: "active" },
        { organizationId: orgB.id, userId: user.id, roleId: role.id, status: "active" },
      ],
    });
  });

  afterAll(async () => {
    if (ids.userId) await prisma.user.delete({ where: { id: ids.userId } }).catch(() => undefined);
    for (const id of [ids.orgAId, ids.orgBId, ids.orgCId]) {
      if (id) await prisma.organization.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("listMembershipsForUser returns the active memberships, alphabetically", async () => {
    if (!ids.userId) throw new Error("setup failed");
    const ms = await listMembershipsForUser(ids.userId);
    expect(ms.map((m) => m.organizationName)).toEqual([
      `Org A ${uniq}`,
      `Org B ${uniq}`,
    ]);
    expect(ms.every((m) => m.roleKey === "firm_admin")).toBe(true);
  });

  it("switchActiveOrganization succeeds for a member org", async () => {
    if (!ids.userId || !ids.orgAId || !ids.orgBId) throw new Error("setup failed");
    await switchActiveOrganization({
      userId: ids.userId,
      fromOrganizationId: ids.orgAId,
      toOrganizationId: ids.orgBId,
    });
    expect(vi.mocked(session.setActiveOrganizationId)).toHaveBeenCalledWith(ids.orgBId);
  });

  it("rejects switching to an org the user is not a member of", async () => {
    if (!ids.userId || !ids.orgAId || !ids.orgCId) throw new Error("setup failed");
    await expect(
      switchActiveOrganization({
        userId: ids.userId,
        fromOrganizationId: ids.orgAId,
        toOrganizationId: ids.orgCId,
      }),
    ).rejects.toThrow();
  });

  it("is a no-op when from === to", async () => {
    if (!ids.userId || !ids.orgAId) throw new Error("setup failed");
    vi.mocked(session.setActiveOrganizationId).mockClear();
    await switchActiveOrganization({
      userId: ids.userId,
      fromOrganizationId: ids.orgAId,
      toOrganizationId: ids.orgAId,
    });
    expect(vi.mocked(session.setActiveOrganizationId)).not.toHaveBeenCalled();
  });
});
