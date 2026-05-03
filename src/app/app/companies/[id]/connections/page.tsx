import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";

import { ConnectionActions } from "./_components/connection-actions";

const ALL_PROVIDERS: { key: string; name: string; phase: string }[] = [
  { key: "paycor", name: "Paycor", phase: "ready" },
  { key: "adp", name: "ADP", phase: "phase 3" },
  { key: "gusto", name: "Gusto", phase: "phase 3" },
  { key: "paychex", name: "Paychex", phase: "phase 3" },
  { key: "isolved", name: "iSolved", phase: "phase 3" },
  { key: "quickbooks", name: "QuickBooks Payroll", phase: "phase 3" },
];

export default async function ConnectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ connected?: string; connect_error?: string; provider?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();

  const company = await db.company.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const connections = await db.payrollConnection.findMany({
    where: { companyId: company.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const recentJobs = await db.syncJob.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const canManage = actor.permissions.has("payroll_connection.create");
  const canSync = actor.permissions.has("payroll_sync.run");

  // Connections grouped by status for display.
  const active = connections.filter((c) => c.status === "active");
  const inactive = connections.filter((c) => c.status !== "active");
  const connectedProviders = new Set(active.map((c) => c.provider));

  return (
    <div className="space-y-8">
      <header>
        <Link href="/app/dashboard" className="text-xs text-subtle hover:text-ink">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {company.name} · Payroll connections
        </h1>
        <p className="text-sm text-subtle">
          Manage how payroll data flows into Nevatas for this company.
        </p>
      </header>

      {/* Banner: callback success */}
      {sp.connected ? (
        <div className="rounded-md border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
          Connected to <strong className="capitalize">{sp.connected}</strong>. Run a sync below to
          import recent payroll runs.
        </div>
      ) : null}
      {/* Banner: callback failure */}
      {sp.connect_error ? (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Connection failed{sp.provider ? ` for ${sp.provider}` : ""}: <code className="font-mono text-xs">{sp.connect_error}</code>.
          Try again, or contact a Firm Admin if it persists.
        </div>
      ) : null}

      {/* Active connections */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
            Active connections ({active.length})
          </h2>
          <p className="text-xs text-subtle">
            Tokens are encrypted at the field level (AES-256-GCM, KMS-wrapped in production).
          </p>
        </div>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
            <p className="text-sm text-subtle">
              No active payroll connections.{" "}
              {canManage ? (
                <span>Connect a provider below to start syncing.</span>
              ) : (
                <span>A Firm Admin can set one up.</span>
              )}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {active.map((c) => {
              const settings = (c.settingsJson ?? {}) as Record<string, unknown>;
              return (
                <li
                  key={c.id}
                  className="rounded-xl border border-border bg-surface overflow-hidden"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 p-5 border-b border-border bg-muted/40">
                    <div>
                      <div className="flex items-center gap-2">
                        <ProviderLogo provider={c.provider} />
                        <h3 className="text-sm font-semibold capitalize">{c.provider}</h3>
                        <StatusPill status={c.status} />
                      </div>
                      {settings.providerCompanyName ? (
                        <p className="mt-1 text-xs text-subtle">
                          {String(settings.providerCompanyName)}
                          {settings.providerAccountId ? (
                            <span className="font-mono"> · {String(settings.providerAccountId)}</span>
                          ) : null}
                        </p>
                      ) : null}
                      <p className="mt-1 font-mono text-[11px] text-subtle">
                        connection_id <span className="text-ink/70">{c.id}</span>
                      </p>
                    </div>
                    <ConnectionActions
                      connectionId={c.id}
                      provider={c.provider}
                      canSync={canSync}
                      canDisconnect={canManage}
                    />
                  </div>

                  <RecentSyncs connectionId={c.id} jobs={recentJobs.filter((j) => j.provider === c.provider)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Available providers */}
      {canManage ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
            Available providers
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {ALL_PROVIDERS.map((p) => {
              const alreadyConnected = connectedProviders.has(p.key);
              const isReady = p.phase === "ready";
              return (
                <ConnectCard
                  key={p.key}
                  provider={p}
                  companyId={company.id}
                  alreadyConnected={alreadyConnected}
                  isReady={isReady}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Past inactive connections — kept for audit trail */}
      {inactive.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
            Inactive ({inactive.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium">Provider</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Connection ID</th>
                </tr>
              </thead>
              <tbody>
                {inactive.map((c) => (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="px-4 py-2 capitalize">{c.provider}</td>
                    <td className="px-4 py-2">
                      <StatusPill status={c.status} />
                    </td>
                    <td className="px-4 py-2 text-subtle font-mono text-xs">
                      {c.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-subtle">{c.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ProviderLogo({ provider }: { provider: string }) {
  return (
    <span
      className="inline-flex items-center justify-center h-7 w-7 rounded-sm bg-ink text-paper font-mono text-[11px] font-medium uppercase tracking-wide"
      aria-hidden
    >
      {provider.slice(0, 2)}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "border-success/30 bg-success/10 text-success"
      : status === "error"
        ? "border-danger/30 bg-danger/10 text-danger"
        : status === "reauth_required"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border bg-muted text-subtle";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function RecentSyncs({
  connectionId,
  jobs,
}: {
  connectionId: string;
  jobs: {
    id: string;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
    errorMessage: string | null;
    metadataJson: unknown;
  }[];
}) {
  const recent = jobs.slice(0, 3);
  return (
    <div className="px-5 py-3">
      <p className="text-[10px] uppercase tracking-wide text-subtle font-mono mb-2">
        Recent syncs
      </p>
      {recent.length === 0 ? (
        <p className="text-xs text-subtle italic">No sync history yet.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {recent.map((j) => {
            const meta = (j.metadataJson ?? {}) as { runsCreated?: number; employeesUpserted?: number };
            return (
              <li key={j.id} className="flex items-center gap-3 font-mono">
                <span className="text-subtle">
                  {j.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <SyncStatusBadge status={j.status} />
                <span className="text-ink/70">
                  {typeof meta.employeesUpserted === "number" ? `${meta.employeesUpserted} emp` : ""}
                  {typeof meta.runsCreated === "number"
                    ? ` · ${meta.runsCreated} run${meta.runsCreated === 1 ? "" : "s"}`
                    : ""}
                </span>
                {j.errorMessage ? (
                  <span className="text-danger truncate max-w-[40ch]" title={j.errorMessage}>
                    {j.errorMessage.slice(0, 50)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <span className="hidden" data-conn-id={connectionId} />
    </div>
  );
}

function SyncStatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "text-success"
      : status === "failed"
        ? "text-danger"
        : status === "running"
          ? "text-warning"
          : "text-subtle";
  return <span className={tone}>{status === "completed" ? "✓" : status === "failed" ? "✗" : "•"} {status}</span>;
}

function ConnectCard({
  provider,
  companyId,
  alreadyConnected,
  isReady,
}: {
  provider: { key: string; name: string; phase: string };
  companyId: string;
  alreadyConnected: boolean;
  isReady: boolean;
}) {
  const disabled = alreadyConnected || !isReady;
  const Tag = (disabled ? "div" : "a") as "a" | "div";
  const props =
    Tag === "a"
      ? {
          href: `/api/integrations/${provider.key}/connect?companyId=${encodeURIComponent(companyId)}`,
        }
      : {};

  return (
    <Tag
      {...props}
      className={
        "rounded-md border bg-surface p-3 flex flex-col items-start gap-2 transition-colors " +
        (disabled
          ? "border-border opacity-60 cursor-not-allowed"
          : "border-border hover:border-brand hover:bg-brand-muted/40 cursor-pointer")
      }
    >
      <div className="flex items-center gap-2">
        <ProviderLogo provider={provider.key} />
        <span className="text-sm font-medium">{provider.name}</span>
      </div>
      <span
        className={
          "text-[10px] uppercase tracking-wide font-mono " +
          (alreadyConnected
            ? "text-success"
            : isReady
              ? "text-brand"
              : "text-subtle")
        }
      >
        {alreadyConnected ? "Connected" : isReady ? "Connect →" : provider.phase}
      </span>
    </Tag>
  );
}
