// Incident index. Lists every incident across every organization with
// quick-filter tiles and a "New incident" link.

import Link from "next/link";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

export default async function IncidentsPage() {
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const incidents = await db.incident.findMany({
    orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { organization: { select: { name: true } } },
  });

  const counts = incidents.reduce(
    (acc, i) => {
      acc.byStatus[i.status] = (acc.byStatus[i.status] ?? 0) + 1;
      acc.bySeverity[i.severity] = (acc.bySeverity[i.severity] ?? 0) + 1;
      return acc;
    },
    {
      byStatus: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
    },
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Incidents</h1>
          <p className="text-sm text-subtle">
            SOC 2 CC7.3-CC7.5 incident response. Open → contained → resolved → closed.
            Closure requires the full narrative (root cause + containment + resolution).
          </p>
        </div>
        <Link
          href="/app/admin/incidents/new"
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg"
        >
          + New incident
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Open" value={(counts.byStatus["open"] ?? 0).toString()} tone={(counts.byStatus["open"] ?? 0) > 0 ? "warn" : "ok"} />
        <Tile label="Contained" value={(counts.byStatus["contained"] ?? 0).toString()} />
        <Tile label="Resolved" value={(counts.byStatus["resolved"] ?? 0).toString()} />
        <Tile label="Closed" value={(counts.byStatus["closed"] ?? 0).toString()} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Incidents ({incidents.length})
        </h2>
        {incidents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-subtle">
            No incidents recorded.{" "}
            <Link href="/app/admin/incidents/new" className="text-brand hover:underline">
              Open the first one →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium">Detected</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Severity</th>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Organization</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Cust. notify</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id} className="border-t border-border align-top">
                    <td className="px-4 py-2 font-mono text-[11px] whitespace-nowrap">
                      {i.detectedAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{i.incidentType}</td>
                    <td className="px-4 py-2">
                      <SeverityPill severity={i.severity} />
                    </td>
                    <td className="px-4 py-2 max-w-[40ch]">
                      <span className="font-medium">{i.title}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-subtle">
                      {i.organization?.name ?? <em>platform</em>}
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill status={i.status} />
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {i.customerNotificationRequired === null ? (
                        <span className="text-subtle">undecided</span>
                      ) : i.customerNotificationRequired ? (
                        <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-warning">
                          required
                        </span>
                      ) : (
                        <span className="text-subtle">not required</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/app/admin/incidents/${i.id}`}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const valueColor = tone === "warn" ? "text-warning" : "text-ink";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const tone =
    severity === "critical"
      ? "border-danger/40 bg-danger/15 text-danger"
      : severity === "high"
        ? "border-danger/30 bg-danger/10 text-danger"
        : severity === "medium"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border bg-muted text-subtle";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {severity}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "open"
      ? "border-warning/40 bg-warning/15 text-warning"
      : status === "contained"
        ? "border-warning/30 bg-warning/10 text-warning"
        : status === "resolved"
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-muted text-subtle";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  );
}
