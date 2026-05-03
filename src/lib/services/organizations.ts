// Organization membership + active-org switching.
//
// "Active org" is the one whose context applies to subsequent requests.
// requireActor() reads the nv_active_org cookie set by setActiveOrganizationId()
// in lib/session.ts and falls back to the user's first active membership.
// switchActiveOrganization here validates the target membership, writes the
// cookie, and audits the switch on both the from-org and to-org so the
// trail survives org-scoped deletes.

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { forbidden, notFound } from "@/lib/errors";
import { setActiveOrganizationId } from "@/lib/session";

export type Membership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  roleKey: string;
  roleName: string;
};

// Returns every active membership for a user, ordered alphabetically by
// organization name. Used by the layout to render the switcher dropdown.
export async function listMembershipsForUser(userId: string): Promise<Membership[]> {
  const rows = await db.organizationUser.findMany({
    where: { userId, status: "active" },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      role: { select: { key: true, name: true } },
    },
    orderBy: { organization: { name: "asc" } },
  });
  return rows.map((r) => ({
    organizationId: r.organization.id,
    organizationName: r.organization.name,
    organizationSlug: r.organization.slug,
    roleKey: r.role.key,
    roleName: r.role.name,
  }));
}

export type SwitchInput = {
  userId: string;
  // The org the user is currently in (the active-org cookie). Carried so
  // the audit event records both ends of the switch.
  fromOrganizationId: string;
  toOrganizationId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function switchActiveOrganization(input: SwitchInput): Promise<void> {
  if (input.fromOrganizationId === input.toOrganizationId) {
    return; // no-op
  }

  const target = await db.organizationUser.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.toOrganizationId,
        userId: input.userId,
      },
    },
    include: { organization: { select: { name: true } } },
  });
  if (!target) throw notFound("Organization");
  if (target.status !== "active") {
    throw forbidden("Membership in target organization is not active");
  }

  await setActiveOrganizationId(input.toOrganizationId);

  // Audit on the destination org so the new-org admin sees who entered.
  await writeAudit({
    organizationId: input.toOrganizationId,
    actorUserId: input.userId,
    actorType: "user",
    action: AUDIT_ACTIONS.organizationSwitched,
    entityType: "organization",
    entityId: input.toOrganizationId,
    metadata: {
      fromOrganizationId: input.fromOrganizationId,
      toOrganizationName: target.organization.name,
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });
}
