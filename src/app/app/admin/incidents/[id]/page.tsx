// Per-incident detail with header, customer-notification panel, timeline,
// note-add form, and lifecycle actions.

import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { requireActor } from "@/lib/session";

import { IncidentActions } from "./incident-actions";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  if (!actor.permissions.has("platform.impersonate")) {
    throw forbidden("Platform-admin only");
  }

  const incident = await db.incident.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true } },
      updates: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!incident) notFound();

  const closed = incident.status === "closed";

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href="/app/admin/incidents" className="text-xs text-subtle hover:text-ink">
          ← All incidents
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{incident.title}</h1>
        <p className="text-sm text-subtle font-mono">
          <span className="font-mono">{incident.incidentType}</span> ·{" "}
          <SeverityPill severity={incident.severity} /> ·{" "}
          <StatusPill status={incident.status} /> · detected{" "}
          {incident.detectedAt.toISOString().slice(0, 16).replace("T", " ")}{" "}
          {incident.organization ? <>· org <strong className="text-ink">{incident.organization.name}</strong></> : <>· <strong className="text-ink">platform-wide</strong></>}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">Description</h2>
        <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm text-ink/85">
          {incident.description}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Customer notification
        </h2>
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          {incident.customerNotificationRequired === null ? (
            <p className="text-subtle italic">
              No decision recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              <p>
                {incident.customerNotificationRequired ? (
                  <span className="rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                    REQUIRED
                  </span>
                ) : (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-subtle">
                    Not required
                  </span>
                )}
                <span className="ml-2 text-xs text-subtle">
                  decided {incident.customerNotificationDecidedAt?.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </p>
              {incident.customerNotificationNotes ? (
                <p className="text-ink/80 italic">&ldquo;{incident.customerNotificationNotes}&rdquo;</p>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {closed ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">Closure narrative</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NarrativeCard label="Root cause" text={incident.rootCause} />
            <NarrativeCard label="Containment" text={incident.containmentActions} />
            <NarrativeCard label="Resolution" text={incident.resolutionActions} />
          </div>
          <p className="text-xs text-subtle font-mono">
            closed {incident.closedAt?.toISOString().slice(0, 16).replace("T", " ")}
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Timeline ({incident.updates.length})
        </h2>
        <ol className="space-y-2">
          {incident.updates.map((u) => (
            <li
              key={u.id}
              className={
                "rounded-md border border-border bg-surface p-3 text-sm " +
                (u.kind === "status_change" ? "border-l-4 border-l-brand" : "")
              }
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[10px] uppercase tracking-wide font-mono text-subtle">
                  {u.kind === "status_change" ? `status: ${u.fromStatus ?? "—"} → ${u.toStatus}` : u.kind.replace("_", " ")}
                </span>
                <span className="text-[11px] font-mono text-subtle">
                  {u.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-ink/85">{u.content}</p>
            </li>
          ))}
        </ol>
      </section>

      {!closed ? (
        <IncidentActions
          incidentId={incident.id}
          currentStatus={incident.status as "open" | "contained" | "resolved" | "closed"}
          customerNotificationDecided={incident.customerNotificationRequired !== null}
          hasRootCause={!!incident.rootCause}
          hasContainment={!!incident.containmentActions}
          hasResolution={!!incident.resolutionActions}
        />
      ) : null}
    </div>
  );
}

function NarrativeCard({ label, text }: { label: string; text: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-ink/85">{text ?? <em className="text-subtle">—</em>}</p>
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
