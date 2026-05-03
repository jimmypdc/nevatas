import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";

import { InviteForm } from "./invite-form";
import { InvitationRowActions } from "./invitation-row-actions";

export default async function UsersPage() {
  const actor = await requireActor();
  const canInvite = actor.permissions.has("user.invite");

  const [members, invites] = await Promise.all([
    db.organizationUser.findMany({
      where: { organizationId: actor.organizationId, status: "active" },
      include: {
        user: { select: { email: true, name: true, mfaEnabled: true } },
        role: { select: { key: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({
      where: { organizationId: actor.organizationId, acceptedAt: null, revokedAt: null },
      include: { role: { select: { key: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Members & invitations</h1>
        <p className="mt-1 text-sm text-subtle">
          Invite teammates to this organization. Plan-sponsor approvers and role managers must enroll
          in MFA before approving contribution files.
        </p>
      </div>

      {canInvite ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Invite a user</h2>
          <div className="rounded-xl border border-border bg-surface p-6">
            <InviteForm />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Members ({members.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">MFA</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{m.user.email}</td>
                  <td className="px-4 py-2">{m.user.name ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{m.role.name}</td>
                  <td className="px-4 py-2 text-xs">
                    {m.user.mfaEnabled ? (
                      <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">
                        on
                      </span>
                    ) : (
                      <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-warning">
                        off
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Pending invitations ({invites.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {invites.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-subtle" colSpan={4}>
                    No pending invitations.
                  </td>
                </tr>
              ) : null}
              {invites.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{i.emailLower}</td>
                  <td className="px-4 py-2 text-xs">{i.role.name}</td>
                  <td className="px-4 py-2 text-xs text-subtle">
                    {i.expiresAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canInvite ? <InvitationRowActions invitationId={i.id} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
