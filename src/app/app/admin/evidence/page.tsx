// SOC 2 evidence center. Read-only dashboard that surfaces the audit /
// security / access data auditors typically ask for. Gated on the
// platform.impersonate permission (Platform Super Admin only) since it
// crosses organization boundaries.
//
// Every panel pulls live data from existing tables — no new schema, no
// background aggregation. Queries are scoped with explicit limits so the
// page stays responsive against a large audit log; "show all" CSV exports
// are a follow-on once auditors signal what they need beyond the in-page
// view.

import Link from "next/link";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

// Action keys treated as high-signal admin activity in the "Recent admin
// actions" panel. Curated rather than scraped from AUDIT_ACTIONS so that
// adding a new audit action doesn't accidentally flood the panel.
const ADMIN_AUDIT_ACTIONS = [
  "admin.impersonation.started",
  "admin.impersonation.stopped",
  "admin.impersonation.expired",
  "admin.impersonation.blocked_action",
  "file.scan.overridden",
  "user.role.changed",
  "user.invited",
  "user.invite.revoked",
  "user.removed",
  "plan_rule.changed",
  "plan_rule.version.created",
  "payroll_connection.created",
  "auth.password.reset.completed",
  "auth.mfa.disabled",
];

// SOC 2 evidence is typically requested over a 30/90 day window.
const WINDOW_DAYS = 30;
const SHORT_WINDOW_HOURS = 24;

export default async function EvidencePage() {
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const now = new Date();
  const since30d = new Date(now.getTime() - WINDOW_DAYS * 24 * 3600 * 1000);
  const since24h = new Date(now.getTime() - SHORT_WINDOW_HOURS * 3600 * 1000);

  // ---------- Snapshot tiles ----------
  const [
    auditEvents30d,
    failedLogins24h,
    activeImpersonations,
    deadJobs,
    userMfaCounts,
    openBlockingIssues,
    oldestAudit,
    latestAudit,
    totalAudit,
  ] = await Promise.all([
    db.auditEvent.count({ where: { createdAt: { gte: since30d } } }),
    db.loginAttempt.count({
      where: {
        createdAt: { gte: since24h },
        outcome: { in: ["bad_password", "bad_mfa", "unknown_user", "locked", "throttled"] },
      },
    }),
    db.impersonationSession.count({ where: { endedAt: null, expiresAt: { gt: now } } }),
    db.backgroundJob.count({ where: { status: "dead" } }),
    db.user.aggregate({
      where: { status: "active" },
      _count: { _all: true },
    }).then(async (total) => {
      const mfa = await db.user.count({ where: { status: "active", mfaEnabled: true } });
      return { total: total._count._all, mfa };
    }),
    db.validationIssue.count({
      where: { status: "open", severity: { in: ["critical", "blocking"] } },
    }),
    db.auditEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.auditEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.auditEvent.count(),
  ]);

  // ---------- Recent admin actions ----------
  const adminEvents = await db.auditEvent.findMany({
    where: { action: { in: ADMIN_AUDIT_ACTIONS } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      action: true,
      actorUserId: true,
      impersonatedBy: true,
      organizationId: true,
      entityType: true,
      entityId: true,
      ipAddress: true,
    },
  });

  // ---------- Authentication evidence ----------
  const loginOutcomes7d = await db.loginAttempt.groupBy({
    by: ["outcome"],
    where: { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } },
    _count: { _all: true },
  });
  const topFailingIps = await db.loginAttempt.groupBy({
    by: ["ipAddress"],
    where: {
      createdAt: { gte: since24h },
      outcome: { in: ["bad_password", "bad_mfa", "unknown_user", "throttled"] },
      ipAddress: { not: null },
    },
    _count: { _all: true },
    orderBy: { _count: { ipAddress: "desc" } },
    take: 10,
  });

  // ---------- Access review ----------
  const memberships = await db.organizationUser.findMany({
    where: { status: "active" },
    include: {
      organization: { select: { name: true, slug: true } },
      role: { select: { name: true, key: true } },
      user: {
        select: {
          email: true,
          mfaEnabled: true,
          lockedUntil: true,
          lastFailedLoginAt: true,
        },
      },
    },
    orderBy: [{ organization: { name: "asc" } }, { user: { email: "asc" } }],
    take: 200,
  });

  // Last-successful-login per user, computed in one pass from LoginAttempt
  // rather than a join (LoginAttempt has no FK to User by design).
  const userEmails = Array.from(new Set(memberships.map((m) => m.user.email.toLowerCase())));
  const successfulLogins =
    userEmails.length > 0
      ? await db.loginAttempt.findMany({
          where: { emailLower: { in: userEmails }, outcome: "succeeded" },
          orderBy: { createdAt: "desc" },
          select: { emailLower: true, createdAt: true },
          take: 5000,
        })
      : [];
  const lastLoginByEmail = new Map<string, Date>();
  for (const a of successfulLogins) {
    if (!lastLoginByEmail.has(a.emailLower)) {
      lastLoginByEmail.set(a.emailLower, a.createdAt);
    }
  }

  // ---------- Sponsor approvals ----------
  const approvals = await db.approvalRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      payrollRun: {
        select: {
          id: true,
          payrollDate: true,
          plan: { select: { name: true, company: { select: { name: true } } } },
        },
      },
    },
  });

  // ---------- Job queue health ----------
  const jobStatusCounts = await db.backgroundJob.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const oldestQueued = await db.backgroundJob.findFirst({
    where: { status: "queued" },
    orderBy: { runAfter: "asc" },
    select: { id: true, jobType: true, runAfter: true },
  });
  const recentDead = await db.backgroundJob.findMany({
    where: { status: "dead" },
    orderBy: { completedAt: "desc" },
    take: 5,
    select: { id: true, jobType: true, attempts: true, errorMessage: true, completedAt: true },
  });

  // ---------- Impersonation sessions (recent) ----------
  const recentImpersonations = await db.impersonationSession.findMany({
    orderBy: { startedAt: "desc" },
    take: 15,
  });

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Evidence center</h1>
        <p className="text-sm text-subtle">
          SOC 2-style snapshot across every organization. Read-only; data is
          live from the audit / security tables. Window:{" "}
          <span className="font-mono">last {WINDOW_DAYS} days</span> unless
          otherwise stated.
        </p>
      </header>

      {/* Snapshot tiles */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          label={`Audit events (${WINDOW_DAYS}d)`}
          value={auditEvents30d.toLocaleString()}
        />
        <Tile
          label="Failed logins (24h)"
          value={failedLogins24h.toLocaleString()}
          tone={failedLogins24h > 50 ? "warn" : "ok"}
        />
        <Tile
          label="Active impersonations"
          value={activeImpersonations.toString()}
          tone={activeImpersonations > 0 ? "warn" : "ok"}
        />
        <Tile
          label="Dead jobs"
          value={deadJobs.toString()}
          tone={deadJobs > 0 ? "warn" : "ok"}
        />
        <Tile
          label="MFA enrolled"
          value={
            userMfaCounts.total === 0
              ? "—"
              : `${Math.round((userMfaCounts.mfa / userMfaCounts.total) * 100)}%`
          }
          sub={`${userMfaCounts.mfa}/${userMfaCounts.total} active users`}
        />
        <Tile
          label="Open critical / blocking"
          value={openBlockingIssues.toString()}
          tone={openBlockingIssues > 0 ? "warn" : "ok"}
        />
      </section>

      {/* Audit-log integrity */}
      <Section title="Audit-log integrity" hint="Append-only at the DB trigger layer; UPDATE/DELETE on AuditEvent raises SQLSTATE 42501.">
        <KvTable
          rows={[
            ["Total events", totalAudit.toLocaleString()],
            ["Oldest record", oldestAudit ? oldestAudit.createdAt.toISOString() : "—"],
            ["Latest record", latestAudit ? latestAudit.createdAt.toISOString() : "—"],
            [
              "Append-only enforced",
              "yes (trigger installed in migration 20260501000001_audit_log_immutability)",
            ],
          ]}
        />
      </Section>

      {/* Recent admin actions */}
      <Section title="Recent admin actions" hint="Last 50 events from a curated set of high-signal actions.">
        {adminEvents.length === 0 ? (
          <Empty>No admin actions recorded yet.</Empty>
        ) : (
          <Table
            headers={["Time (UTC)", "Action", "Actor", "Impersonated by", "Entity", "IP"]}
            rows={adminEvents.map((e) => [
              e.createdAt.toISOString(),
              <span key="a" className="font-mono text-xs">{e.action}</span>,
              <span key="u" className="font-mono text-[11px]">{shortId(e.actorUserId)}</span>,
              <span key="i" className="font-mono text-[11px]">{shortId(e.impersonatedBy)}</span>,
              <span key="e" className="font-mono text-[11px]">
                {e.entityType}
                {e.entityId ? `:${e.entityId.slice(0, 10)}…` : ""}
              </span>,
              <span key="ip" className="font-mono text-[11px]">{e.ipAddress ?? "—"}</span>,
            ])}
          />
        )}
      </Section>

      {/* Authentication evidence */}
      <Section title="Authentication evidence" hint="Login attempts grouped by outcome over the last 7 days.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <KvTable
            rows={loginOutcomes7d
              .sort((a, b) => b._count._all - a._count._all)
              .map((o) => [o.outcome, o._count._all.toLocaleString()])}
          />
          <div>
            <p className="mb-2 text-xs font-mono text-subtle uppercase tracking-wide">
              Top failing IPs ({SHORT_WINDOW_HOURS}h)
            </p>
            {topFailingIps.length === 0 ? (
              <Empty>No failing IPs in the last 24h.</Empty>
            ) : (
              <KvTable
                rows={topFailingIps.map((r) => [
                  r.ipAddress ?? "—",
                  r._count._all.toLocaleString(),
                ])}
                mono
              />
            )}
          </div>
        </div>
      </Section>

      {/* Access review */}
      <Section
        title={`Access review (${memberships.length} active memberships)`}
        hint="Every active organization membership with role + MFA + last successful login."
      >
        {memberships.length === 0 ? (
          <Empty>No active memberships.</Empty>
        ) : (
          <Table
            headers={["Organization", "User", "Role", "MFA", "Last login", "Locked"]}
            rows={memberships.map((m) => {
              const last = lastLoginByEmail.get(m.user.email.toLowerCase());
              const locked = m.user.lockedUntil && m.user.lockedUntil > now;
              return [
                m.organization.name,
                <span key="e" className="font-mono text-xs">{m.user.email}</span>,
                <span key="r" className="font-mono text-xs">{m.role.key}</span>,
                m.user.mfaEnabled ? (
                  <span key="m" className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success">
                    enrolled
                  </span>
                ) : (
                  <span key="m" className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs text-warning">
                    none
                  </span>
                ),
                <span key="l" className="font-mono text-[11px]">
                  {last ? last.toISOString().slice(0, 16).replace("T", " ") : "never"}
                </span>,
                locked ? (
                  <span key="x" className="rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-xs text-danger">
                    locked
                  </span>
                ) : "—",
              ];
            })}
          />
        )}
      </Section>

      {/* Sponsor approvals */}
      <Section title="Sponsor approvals" hint="Last 25 contribution approvals with the certification, signer, IP, and user-agent.">
        {approvals.length === 0 ? (
          <Empty>No sponsor approvals recorded yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {approvals.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-surface p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {a.payrollRun.plan.company.name} · {a.payrollRun.plan.name}
                    </div>
                    <div className="text-xs text-subtle font-mono">
                      payroll {a.payrollRun.payrollDate.toISOString().slice(0, 10)} ·{" "}
                      <Link href={`/app/payroll-runs/${a.payrollRun.id}`} className="text-brand hover:underline">
                        run {a.payrollRun.id.slice(0, 10)}…
                      </Link>
                    </div>
                  </div>
                  <div className="text-xs text-subtle font-mono">
                    {a.createdAt.toISOString()}
                    {a.invalidatedAt ? (
                      <span className="ml-2 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-warning">
                        invalidated
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 text-xs text-ink/80 italic">
                  &ldquo;{a.certificationText.slice(0, 220)}{a.certificationText.length > 220 ? "…" : ""}&rdquo;
                </p>
                <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] font-mono text-subtle">
                  <div>
                    <dt className="text-ink/60">signer</dt>
                    <dd>{shortId(a.approvedById)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink/60">ip</dt>
                    <dd>{a.ipAddress ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-ink/60">file sha256</dt>
                    <dd>{a.fileChecksum ? `${a.fileChecksum.slice(0, 16)}…` : "—"}</dd>
                  </div>
                  <div className="sm:col-span-3">
                    <dt className="text-ink/60">user-agent</dt>
                    <dd className="truncate" title={a.userAgent ?? ""}>
                      {a.userAgent ?? "—"}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Job queue health */}
      <Section title="Job queue health" hint="Background-job state across the whole platform.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <KvTable
            rows={jobStatusCounts
              .sort((a, b) => b._count._all - a._count._all)
              .map((r) => [r.status, r._count._all.toLocaleString()])}
          />
          <div className="space-y-3">
            {oldestQueued ? (
              <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs">
                <div className="text-subtle">Oldest queued</div>
                <div className="mt-1 font-mono">
                  {oldestQueued.jobType} · runAfter {oldestQueued.runAfter.toISOString()}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-subtle">
                No queued jobs.
              </div>
            )}
            {recentDead.length > 0 ? (
              <div>
                <p className="text-xs font-mono uppercase tracking-wide text-subtle mb-2">
                  Recent dead-letter jobs ({recentDead.length})
                </p>
                <ul className="space-y-1.5">
                  {recentDead.map((j) => (
                    <li key={j.id} className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs">
                      <div className="font-mono">
                        {j.jobType} · {j.attempts} attempt(s) ·{" "}
                        {j.completedAt ? j.completedAt.toISOString() : "—"}
                      </div>
                      {j.errorMessage ? (
                        <div className="mt-1 text-danger truncate" title={j.errorMessage}>
                          {j.errorMessage.slice(0, 200)}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </Section>

      {/* Recent impersonation sessions */}
      <Section title="Recent impersonation sessions" hint="Last 15. Active rows have no endedAt.">
        {recentImpersonations.length === 0 ? (
          <Empty>No impersonation sessions recorded.</Empty>
        ) : (
          <Table
            headers={["Started (UTC)", "Admin", "Target", "Reason", "Ended", "End reason"]}
            rows={recentImpersonations.map((s) => [
              s.startedAt.toISOString(),
              <span key="a" className="font-mono text-[11px]">{shortId(s.adminUserId)}</span>,
              <span key="t" className="font-mono text-[11px]">{shortId(s.targetUserId)}</span>,
              <span key="r" className="truncate max-w-[40ch] inline-block" title={s.reason}>
                {s.reason.slice(0, 60)}
              </span>,
              s.endedAt ? (
                <span key="e" className="font-mono text-[11px]">{s.endedAt.toISOString()}</span>
              ) : (
                <span key="e" className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs text-warning">
                  active
                </span>
              ),
              s.endedReason ?? "—",
            ])}
          />
        )}
      </Section>
    </div>
  );
}

/* ---------- presentation primitives ---------- */

function Tile({
  label,
  value,
  sub,
  tone = "ok",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn";
}) {
  const valueColor = tone === "warn" ? "text-warning" : "text-ink";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-subtle">{sub}</div> : null}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-t border-border align-top">
              {cells.map((c, j) => (
                <td key={j} className="px-4 py-2">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KvTable({ rows, mono = false }: { rows: [string, string][]; mono?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i} className="border-t border-border first:border-t-0">
              <td className={`px-4 py-2 text-subtle ${mono ? "font-mono text-xs" : ""}`}>{k}</td>
              <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-subtle">
      {children}
    </div>
  );
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return `${id.slice(0, 10)}…`;
}
