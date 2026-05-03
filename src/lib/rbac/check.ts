import { db } from "@/lib/db";
import { forbidden, unauthenticated } from "@/lib/errors";
import { PERMISSIONS, type PermissionKey } from "@/lib/rbac/permissions";

export type ActorContext = {
  // The EFFECTIVE user the request acts as. During admin impersonation
  // this is the impersonated (target) user, NOT the admin. Audit events
  // attribute against this id; org-scoped queries use this id.
  userId: string;
  organizationId: string;
  roleKey: string;
  permissions: Set<PermissionKey>;
  // When set, the action is being performed by an admin via impersonation.
  // writeAudit reads this to populate the impersonatedBy column. Sensitive
  // permissions are stripped from `permissions` above when this is set.
  impersonatedBy?: string;
};

// Permissions stripped from the actor's effective set while impersonating.
// Admins can debug a user's experience but cannot exercise sensitive
// authorities on the user's behalf — the user's signature on a contribution
// approval, the role of granting another user a role, etc.
const PERMISSIONS_BLOCKED_DURING_IMPERSONATION: ReadonlySet<PermissionKey> = new Set([
  PERMISSIONS.contributionApprove,
  PERMISSIONS.contributionSubmit,
  PERMISSIONS.roleManage,
  PERMISSIONS.apiKeyCreate,
  PERMISSIONS.payrollFileScanOverride,
  PERMISSIONS.userInvite,
]);

// Loads an actor's effective permissions for a given organization. Caller must
// already have established the user's identity (NextAuth session) and the org
// they're acting in.
export async function loadActor(params: {
  userId: string;
  organizationId: string;
  impersonatedBy?: string;
}): Promise<ActorContext> {
  const membership = await db.organizationUser.findUnique({
    where: {
      organizationId_userId: {
        organizationId: params.organizationId,
        userId: params.userId,
      },
    },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });

  if (!membership || membership.status !== "active") {
    throw unauthenticated("No active membership in this organization");
  }

  const perms = new Set<PermissionKey>(
    membership.role.permissions.map((rp) => rp.permission.key as PermissionKey),
  );

  if (params.impersonatedBy) {
    for (const blocked of PERMISSIONS_BLOCKED_DURING_IMPERSONATION) {
      perms.delete(blocked);
    }
  }

  return {
    userId: params.userId,
    organizationId: params.organizationId,
    roleKey: membership.role.key,
    permissions: perms,
    impersonatedBy: params.impersonatedBy,
  };
}

export function hasPermission(actor: ActorContext, permission: PermissionKey): boolean {
  return actor.permissions.has(permission);
}

// Hard check — throws if missing. Use at the top of every protected handler.
export function requirePermission(actor: ActorContext, permission: PermissionKey): void {
  if (!actor.permissions.has(permission)) {
    throw forbidden(`Missing required permission: ${permission}`);
  }
}

export function isImpersonating(actor: ActorContext): boolean {
  return Boolean(actor.impersonatedBy);
}
