// Integration coverage for the invitation flow. Skipped by default;
// enable with RUN_DB_INTEGRATION_TESTS=1.

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sha256Hex, hashPassword } from "@/lib/crypto/hashing";
import {
  acceptInvitation,
  createInvitation,
  lookupInvitationByToken,
  revokeInvitation,
} from "@/lib/services/invitations";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("invitation flow", () => {
  const prisma = new PrismaClient();
  const ids: { orgId?: string; inviterId?: string } = {};
  const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    process.env.EMAIL_DRIVER = "console";
    process.env.EMAIL_FROM = process.env.EMAIL_FROM ?? "Test <noreply@local>";
    const org = await prisma.organization.create({
      data: { name: `Invite Org ${uniq}`, slug: `invite-${uniq}` },
    });
    ids.orgId = org.id;
    const inviter = await prisma.user.create({
      data: {
        email: `inviter-${uniq}@local`,
        name: "Inviter",
        passwordHash: await hashPassword("InviterPasswordOk!1234"),
        emailVerified: new Date(),
      },
    });
    ids.inviterId = inviter.id;
    const role = await prisma.role.findFirstOrThrow({ where: { key: "firm_admin" } });
    await prisma.organizationUser.create({
      data: { organizationId: org.id, userId: inviter.id, roleId: role.id },
    });
  });

  afterAll(async () => {
    if (ids.orgId) {
      await prisma.user.deleteMany({
        where: { email: { in: [`inviter-${uniq}@local`, `invitee-${uniq}@local`] } },
      });
      await prisma.organization.delete({ where: { id: ids.orgId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("create → lookup → accept (new user) wires up the membership", async () => {
    if (!ids.orgId || !ids.inviterId) throw new Error("setup failed");
    const created = await createInvitation({
      organizationId: ids.orgId,
      inviterUserId: ids.inviterId,
      email: `invitee-${uniq}@local`,
      roleKey: "firm_operations_user",
      appUrl: "https://app.nevatas.local",
    });
    expect(created.hasExistingUser).toBe(false);

    // Reproduce a known raw token and rewrite the row's hash so the test
    // can complete the public flow without intercepting the email body.
    const raw = `accept-${uniq}`;
    await prisma.invitation.update({
      where: { id: created.id },
      data: { tokenHash: sha256Hex(raw) },
    });

    const summary = await lookupInvitationByToken(raw);
    expect(summary.organizationName).toContain("Invite Org");
    expect(summary.hasExistingUser).toBe(false);

    const result = await acceptInvitation({
      rawToken: raw,
      name: "Invitee",
      password: "Inv!teePassword99",
    });
    expect(result.userId).toBeDefined();

    const membership = await prisma.organizationUser.findFirstOrThrow({
      where: { organizationId: ids.orgId, userId: result.userId },
      include: { role: true },
    });
    expect(membership.role.key).toBe("firm_operations_user");
    expect(membership.status).toBe("active");
  });

  it("rejects a re-accept of the same token", async () => {
    const raw = `accept-${uniq}`;
    await expect(
      acceptInvitation({ rawToken: raw, name: "x", password: "AnotherStrongPw!1234" }),
    ).rejects.toThrow();
  });

  it("revoking an invite makes the token unusable", async () => {
    if (!ids.orgId || !ids.inviterId) throw new Error("setup failed");
    const second = await createInvitation({
      organizationId: ids.orgId,
      inviterUserId: ids.inviterId,
      email: `invitee2-${uniq}@local`,
      roleKey: "read_only_auditor",
      appUrl: "https://app.nevatas.local",
    });
    const raw = `revoke-${uniq}`;
    await prisma.invitation.update({
      where: { id: second.id },
      data: { tokenHash: sha256Hex(raw) },
    });

    await revokeInvitation({
      organizationId: ids.orgId,
      actorUserId: ids.inviterId,
      invitationId: second.id,
    });
    await expect(lookupInvitationByToken(raw)).rejects.toThrow(/revoked/i);
  });

  it("creating a second invite for the same email supersedes the first", async () => {
    if (!ids.orgId || !ids.inviterId) throw new Error("setup failed");
    const email = `dup-${uniq}@local`;
    const a = await createInvitation({
      organizationId: ids.orgId,
      inviterUserId: ids.inviterId,
      email,
      roleKey: "payroll_admin",
      appUrl: "https://app",
    });
    const b = await createInvitation({
      organizationId: ids.orgId,
      inviterUserId: ids.inviterId,
      email,
      roleKey: "payroll_admin",
      appUrl: "https://app",
    });
    expect(a.id).not.toBe(b.id);
    const old = await prisma.invitation.findUniqueOrThrow({ where: { id: a.id } });
    expect(old.revokedAt).not.toBeNull();
  });

  it("rejects a role on the invite denylist", async () => {
    if (!ids.orgId || !ids.inviterId) throw new Error("setup failed");
    await expect(
      createInvitation({
        organizationId: ids.orgId,
        inviterUserId: ids.inviterId,
        email: `bad-${uniq}@local`,
        // Invitable roles are typed; use an as-cast to bypass for the test.
        roleKey: "platform_super_admin" as never,
        appUrl: "https://app",
      }),
    ).rejects.toThrow(/cannot be assigned/i);
  });
});
