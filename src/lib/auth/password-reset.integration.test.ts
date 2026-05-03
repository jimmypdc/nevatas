// Integration coverage for the password-reset flow. Skipped by default;
// enable with RUN_DB_INTEGRATION_TESTS=1.

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword, sha256Hex } from "@/lib/crypto/hashing";
import { completePasswordReset, requestPasswordReset } from "@/lib/auth/password-reset";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled("password reset flow", () => {
  const prisma = new PrismaClient();
  const ids: { orgId?: string; userId?: string } = {};
  const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `pwreset-${uniq}@local`;

  beforeAll(async () => {
    process.env.EMAIL_DRIVER = "console";
    process.env.EMAIL_FROM = process.env.EMAIL_FROM ?? "Test <noreply@local>";
    const org = await prisma.organization.create({
      data: { name: "PWReset Org", slug: `pwreset-${uniq}` },
    });
    ids.orgId = org.id;
    const user = await prisma.user.create({
      data: {
        email,
        name: "PW Reset",
        passwordHash: await hashPassword("OldPasswordIsSecure!12345"),
        emailVerified: new Date(),
      },
    });
    ids.userId = user.id;
    const role = await prisma.role.findFirstOrThrow({ where: { key: "firm_admin" } });
    await prisma.organizationUser.create({
      data: { organizationId: org.id, userId: user.id, roleId: role.id },
    });
  });

  afterAll(async () => {
    if (ids.userId) await prisma.user.delete({ where: { id: ids.userId } }).catch(() => undefined);
    if (ids.orgId) await prisma.organization.delete({ where: { id: ids.orgId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("requesting + completing rotates the password and consumes the token", async () => {
    if (!ids.userId) throw new Error("setup failed");
    await requestPasswordReset({ email, appUrl: "https://app.nevatas.local" });

    const tokens = await prisma.passwordResetToken.findMany({
      where: { userId: ids.userId, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(tokens.length).toBe(1);

    // Reproduce the raw token from a fresh request — service did not return
    // it (only the email did). For the test we issue a synthetic raw token,
    // hash it, and replace the row's hash so the test can complete the flow.
    const raw = "test-token-" + uniq;
    await prisma.passwordResetToken.update({
      where: { id: tokens[0]!.id },
      data: { tokenHash: sha256Hex(raw) },
    });

    await completePasswordReset({
      token: raw,
      newPassword: "BrandNewPasswordX!@99",
    });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: ids.userId } });
    expect(after.passwordChangedAt).not.toBeNull();
    const consumed = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: ids.userId },
    });
    expect(consumed.usedAt).not.toBeNull();
  });

  it("rejects a second use of the same token", async () => {
    const raw = "test-token-" + uniq;
    await expect(
      completePasswordReset({ token: raw, newPassword: "AnotherPasswordOne!1" }),
    ).rejects.toThrow();
  });

  it("rejects a password that fails policy", async () => {
    if (!ids.userId) throw new Error("setup failed");
    await requestPasswordReset({ email, appUrl: "https://app.nevatas.local" });
    const t = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: ids.userId, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const raw = "another-test-token-" + uniq;
    await prisma.passwordResetToken.update({
      where: { id: t.id },
      data: { tokenHash: sha256Hex(raw) },
    });
    await expect(
      completePasswordReset({ token: raw, newPassword: "short" }),
    ).rejects.toThrow(/policy/i);
  });

  it("requestPasswordReset does not throw for an unknown email", async () => {
    await expect(
      requestPasswordReset({ email: "definitely-not-a-user@local", appUrl: "https://app" }),
    ).resolves.toBeUndefined();
  });
});
