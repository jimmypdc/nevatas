import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { ROLES } from "@/lib/rbac/roles";
import { isImpersonatingNow, requireActor } from "@/lib/session";

import { ImpersonateForm } from "./impersonate-form";

export default async function ImpersonatePage() {
  // While impersonating the actor IS the target user — they don't have
  // platform.impersonate. Bounce them so the admin must stop first.
  if (await isImpersonatingNow()) redirect("/app/dashboard");
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const users = await db.user.findMany({
    where: { status: "active" },
    select: {
      id: true,
      email: true,
      name: true,
      organizations: {
        where: { status: "active" },
        select: {
          organization: { select: { name: true, slug: true } },
          role: { select: { key: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { email: "asc" },
    take: 200,
  });

  // Hide the admin themselves and any other platform-level admins.
  const inviteable = users.filter((u) => {
    if (u.id === actor.userId) return false;
    return !u.organizations.some(
      (o) => o.role.key === ROLES.platformSuperAdmin || o.role.key === ROLES.platformSupportAdmin,
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Impersonate user</h1>
        <p className="mt-1 text-sm text-subtle">
          Available only to Platform Super Admins. The session is time-boxed at 1 hour. Every action
          you take while impersonating is double-attributed in the audit log to both you and the
          target user. Sponsor approval, role management, and other sensitive permissions are
          unavailable while impersonating.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Memberships</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {inviteable.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-subtle">
                  No impersonateable users.
                </td>
              </tr>
            ) : null}
            {inviteable.map((u) => (
              <tr key={u.id} className="border-t border-border align-top">
                <td className="px-4 py-2 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-2">{u.name ?? "—"}</td>
                <td className="px-4 py-2 text-xs">
                  {u.organizations.length === 0 ? (
                    <span className="text-subtle">none</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {u.organizations.map((o, i) => (
                        <li key={i}>
                          <span>{o.organization.name}</span>
                          <span className="text-subtle"> · {o.role.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <ImpersonateForm targetUserId={u.id} targetEmail={u.email} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
