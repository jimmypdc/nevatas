// Verifies that loadActor() strips the documented sensitive permissions
// when impersonating, while leaving them intact in non-impersonated
// sessions. Uses a Prisma mock for the membership lookup.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    organizationUser: {
      findUnique: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { isImpersonating, loadActor } from "@/lib/rbac/check";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const allPerms = [
  PERMISSIONS.companyRead,
  PERMISSIONS.contributionApprove,
  PERMISSIONS.contributionSubmit,
  PERMISSIONS.roleManage,
  PERMISSIONS.apiKeyCreate,
  PERMISSIONS.payrollFileScanOverride,
  PERMISSIONS.userInvite,
  PERMISSIONS.payrollFileUpload,
];

function membershipWithPermissions(permKeys: string[]) {
  return {
    id: "m1",
    organizationId: "org1",
    userId: "u1",
    roleId: "r1",
    status: "active",
    role: {
      id: "r1",
      key: "firm_admin",
      name: "Firm Admin",
      permissions: permKeys.map((k) => ({
        id: `rp-${k}`,
        roleId: "r1",
        permissionId: `p-${k}`,
        permission: { id: `p-${k}`, key: k, description: null },
      })),
    },
  };
}

describe("loadActor + impersonation", () => {
  beforeEach(() => {
    vi.mocked(db.organizationUser.findUnique).mockResolvedValue(
      membershipWithPermissions(allPerms) as never,
    );
  });
  afterEach(() => {
    vi.mocked(db.organizationUser.findUnique).mockReset();
  });

  it("returns the full role permissions when not impersonating", async () => {
    const actor = await loadActor({ userId: "u1", organizationId: "org1" });
    expect(actor.permissions.has(PERMISSIONS.contributionApprove)).toBe(true);
    expect(actor.permissions.has(PERMISSIONS.roleManage)).toBe(true);
    expect(isImpersonating(actor)).toBe(false);
  });

  it("strips the sensitive set when impersonating", async () => {
    const actor = await loadActor({
      userId: "u1",
      organizationId: "org1",
      impersonatedBy: "admin1",
    });
    expect(isImpersonating(actor)).toBe(true);
    // Stripped:
    expect(actor.permissions.has(PERMISSIONS.contributionApprove)).toBe(false);
    expect(actor.permissions.has(PERMISSIONS.contributionSubmit)).toBe(false);
    expect(actor.permissions.has(PERMISSIONS.roleManage)).toBe(false);
    expect(actor.permissions.has(PERMISSIONS.apiKeyCreate)).toBe(false);
    expect(actor.permissions.has(PERMISSIONS.payrollFileScanOverride)).toBe(false);
    expect(actor.permissions.has(PERMISSIONS.userInvite)).toBe(false);
    // Preserved:
    expect(actor.permissions.has(PERMISSIONS.companyRead)).toBe(true);
    expect(actor.permissions.has(PERMISSIONS.payrollFileUpload)).toBe(true);
  });

  it("preserves the admin id in actor.impersonatedBy", async () => {
    const actor = await loadActor({
      userId: "u1",
      organizationId: "org1",
      impersonatedBy: "admin1",
    });
    expect(actor.impersonatedBy).toBe("admin1");
    expect(actor.userId).toBe("u1"); // effective user
  });
});
