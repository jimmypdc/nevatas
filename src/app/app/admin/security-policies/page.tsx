// Admin index. Lists all policies with coverage % per active version.

import Link from "next/link";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

export default async function SecurityPoliciesPage() {
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const policies = await db.securityPolicy.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      versions: {
        where: { status: "active" },
        include: { _count: { select: { acknowledgments: true } } },
        take: 1,
      },
    },
  });

  const totalActiveUsers = await db.user.count({ where: { status: "active" } });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Security policies</h1>
          <p className="text-sm text-subtle">
            SOC 2 CC2.3 policy distribution + acknowledgment evidence. Users
            land on a click-through gate at sign-in until they&apos;ve
            acknowledged every active policy version. Each acknowledgment
            captures user, version, timestamp, IP, and user-agent.
          </p>
        </div>
        <Link
          href="/app/admin/security-policies/new"
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg"
        >
          + New policy
        </Link>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Policies ({policies.length})
        </h2>
        {policies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-subtle">
            No policies yet.{" "}
            <Link href="/app/admin/security-policies/new" className="text-brand hover:underline">
              Publish the first one →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium">Key</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Active version</th>
                  <th className="px-4 py-2 font-medium">Coverage</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => {
                  const active = p.versions[0];
                  const acked = active?._count.acknowledgments ?? 0;
                  const coveragePct =
                    totalActiveUsers === 0 ? 0 : Math.round((acked / totalActiveUsers) * 100);
                  return (
                    <tr key={p.id} className="border-t border-border align-top">
                      <td className="px-4 py-2 font-mono text-xs">{p.key}</td>
                      <td className="px-4 py-2">{p.name}</td>
                      <td className="px-4 py-2">
                        <StatusPill status={p.status} />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {active ? `v${active.version}` : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {p.status === "active" && active ? (
                          <span className={"font-mono text-xs " + (coveragePct === 100 ? "text-success" : coveragePct > 0 ? "text-warning" : "text-danger")}>
                            {coveragePct}% ({acked}/{totalActiveUsers})
                          </span>
                        ) : (
                          <span className="text-subtle text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/app/admin/security-policies/${p.id}`}
                          className="text-xs font-medium text-brand hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "border-success/30 bg-success/10 text-success"
      : "border-border bg-muted text-subtle";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  );
}
