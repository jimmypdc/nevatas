import Link from "next/link";

import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ connected?: string; connect_error?: string; provider?: string }>;
}) {
  const actor = await requireActor();
  const sp = (await searchParams) ?? {};

  const [companies, recentRuns, pendingApproval, criticalIssues] = await Promise.all([
    db.company.findMany({
      where: { organizationId: actor.organizationId },
      select: {
        id: true,
        name: true,
        _count: { select: { plans: true } },
        plans: { select: { id: true, name: true, planNumber: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.payrollRun.findMany({
      where: { plan: { company: { organizationId: actor.organizationId } } },
      include: { plan: { select: { name: true, company: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.payrollRun.count({
      where: {
        plan: { company: { organizationId: actor.organizationId } },
        status: { in: ["validated", "exception_review", "generated"] },
      },
    }),
    db.validationIssue.count({
      where: {
        payrollRun: { plan: { company: { organizationId: actor.organizationId } } },
        severity: { in: ["critical", "blocking"] },
        status: "open",
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      {sp.connected ? (
        <div className="rounded-md border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
          Connected to <strong className="capitalize">{sp.connected}</strong>. Open the company&apos;s
          connections page to run a sync.
        </div>
      ) : null}
      {sp.connect_error ? (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Connection failed{sp.provider ? ` for ${sp.provider}` : ""}: <code className="font-mono text-xs">{sp.connect_error}</code>.
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Companies" value={companies.length.toString()} />
        <Stat label="Pending approval" value={pendingApproval.toString()} />
        <Stat label="Open critical issues" value={criticalIssues.toString()} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Companies</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Plans</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-t border-border align-top">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">
                    {c.plans.length === 0 ? (
                      <span className="text-xs text-subtle">no plans</span>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {c.plans.map((p) => (
                          <li key={p.id} className="flex items-center gap-2">
                            <span>{p.name}{p.planNumber ? ` · #${p.planNumber}` : ""}</span>
                            <Link
                              href={`/app/plans/${p.id}/rules`}
                              className="text-brand hover:underline"
                            >
                              rules
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Link
                      href={`/app/companies/${c.id}/connections`}
                      className="text-xs font-medium text-brand hover:underline mr-3"
                    >
                      Connections
                    </Link>
                    <Link
                      href={`/app/upload?companyId=${c.id}`}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      Upload payroll
                    </Link>
                  </td>
                </tr>
              ))}
              {companies.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-subtle" colSpan={3}>
                    No companies in this organization yet. In dev, run{" "}
                    <code className="font-mono text-xs">npm run db:seed</code> to create
                    demo data; in production a Firm Admin sets up companies during plan onboarding.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Recent payroll runs</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{r.payrollDate.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2">{r.plan.name}</td>
                  <td className="px-4 py-2 text-subtle">{r.plan.company.name}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/app/payroll-runs/${r.id}`} className="text-xs font-medium text-brand hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {recentRuns.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-subtle" colSpan={5}>
                    No payroll runs yet.{" "}
                    {companies.length > 0 ? (
                      <Link href="/app/upload" className="text-brand hover:underline">
                        Upload a payroll CSV
                      </Link>
                    ) : (
                      "Set up a company first."
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "approved" || status === "submitted" || status === "accepted"
      ? "bg-success/10 text-success border-success/20"
      : status === "exception_review" || status === "rejected"
        ? "bg-danger/10 text-danger border-danger/20"
        : status === "validated" || status === "generated"
          ? "bg-warning/10 text-warning border-warning/20"
          : "bg-muted text-subtle border-border";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>
  );
}
