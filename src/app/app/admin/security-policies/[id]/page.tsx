// Per-policy detail. Shows the active version content, version history,
// acknowledgment list, and admin actions (publish new version / retire).

import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

import { PolicyActions } from "./policy-actions";

export default async function SecurityPolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const policy = await db.securityPolicy.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { version: "desc" },
        include: {
          _count: { select: { acknowledgments: true } },
        },
      },
    },
  });
  if (!policy) notFound();

  const activeVersion = policy.versions.find((v) => v.status === "active") ?? null;

  const acknowledgments = activeVersion
    ? await db.securityPolicyAcknowledgment.findMany({
        where: { policyVersionId: activeVersion.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  const totalActiveUsers = await db.user.count({ where: { status: "active" } });
  const acksByUserId = new Map(acknowledgments.map((a) => [a.userId, a]));
  const allActiveUsers = await db.user.findMany({
    where: { status: "active" },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href="/app/admin/security-policies" className="text-xs text-subtle hover:text-ink">
          ← Security policies
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{policy.name}</h1>
        <p className="text-sm text-subtle font-mono">
          key <strong className="text-ink">{policy.key}</strong> · status{" "}
          <strong className="text-ink">{policy.status}</strong>
          {activeVersion ? <> · active v{activeVersion.version}</> : null}
        </p>
        {policy.description ? (
          <p className="text-sm text-ink/80">{policy.description}</p>
        ) : null}
      </header>

      {activeVersion ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Active content (v{activeVersion.version})
          </h2>
          <pre className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm font-sans text-ink/85">
            {activeVersion.content}
          </pre>
          {activeVersion.changeSummary ? (
            <p className="text-xs text-subtle italic">
              Change summary: {activeVersion.changeSummary}
            </p>
          ) : null}
          <p className="text-xs text-subtle font-mono">
            published {activeVersion.publishedAt.toISOString().slice(0, 16).replace("T", " ")}
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Version history ({policy.versions.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Published</th>
                <th className="px-4 py-2 font-medium">Acknowledgments</th>
                <th className="px-4 py-2 font-medium">Change summary</th>
              </tr>
            </thead>
            <tbody>
              {policy.versions.map((v) => (
                <tr key={v.id} className="border-t border-border align-top">
                  <td className="px-4 py-2 font-mono text-xs">v{v.version}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                        (v.status === "active"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-border bg-muted text-subtle")
                      }
                    >
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-subtle">
                    {v.publishedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {v._count.acknowledgments}
                  </td>
                  <td className="px-4 py-2 text-xs text-subtle italic max-w-[40ch] truncate">
                    {v.changeSummary ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {activeVersion && policy.status === "active" ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Acknowledgment coverage ({acknowledgments.length} / {totalActiveUsers})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Acknowledged</th>
                  <th className="px-4 py-2 font-medium">IP</th>
                  <th className="px-4 py-2 font-medium">User-agent</th>
                </tr>
              </thead>
              <tbody>
                {allActiveUsers.map((u) => {
                  const ack = acksByUserId.get(u.id);
                  return (
                    <tr key={u.id} className="border-t border-border align-top">
                      <td className="px-4 py-2 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-2 font-mono text-[11px]">
                        {ack ? (
                          ack.createdAt.toISOString().slice(0, 16).replace("T", " ")
                        ) : (
                          <span className="text-warning">outstanding</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px] text-subtle">
                        {ack?.ipAddress ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-subtle truncate max-w-[40ch]" title={ack?.userAgent ?? ""}>
                        {ack?.userAgent ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {policy.status === "active" ? (
        <PolicyActions
          policyId={policy.id}
          activeContent={activeVersion?.content ?? ""}
        />
      ) : (
        <section className="rounded-xl border border-border bg-muted p-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-subtle mb-1">Retired</div>
          <p className="text-ink/80">
            This policy was retired{" "}
            {policy.retiredAt?.toISOString().slice(0, 10) ?? "—"}. Existing
            acknowledgments are preserved for audit history.
          </p>
        </section>
      )}
    </div>
  );
}
