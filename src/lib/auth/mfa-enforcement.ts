// Step-up enforcement: certain permissions cannot be exercised by an account
// that has not enrolled in MFA. Phase 1 policy: the account must have
// mfaEnabled=true. Per-action re-verification (e.g. "re-enter TOTP within
// the last 5 minutes") is a Phase 2 enhancement that requires JWT changes.

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { PERMISSIONS, type PermissionKey } from "@/lib/rbac/permissions";
import type { ActorContext } from "@/lib/rbac/check";

export const MFA_REQUIRED_PERMISSIONS = new Set<PermissionKey>([
  PERMISSIONS.contributionApprove,
  PERMISSIONS.contributionSubmit,
  PERMISSIONS.roleManage,
  PERMISSIONS.apiKeyCreate,
]);

export function permissionRequiresMfa(permission: PermissionKey): boolean {
  return MFA_REQUIRED_PERMISSIONS.has(permission);
}

// Throws forbidden() if the actor's account does not have MFA enabled and
// the permission they're exercising is on the MFA-required list.
export async function requireMfaIfPermissionRequires(
  actor: ActorContext,
  permission: PermissionKey,
): Promise<void> {
  if (!permissionRequiresMfa(permission)) return;
  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: { mfaEnabled: true },
  });
  if (!user?.mfaEnabled) {
    throw forbidden(
      `Action requires multi-factor authentication. Enroll at /app/account/security before using "${permission}".`,
    );
  }
}
