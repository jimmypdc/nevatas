"use client";

// Provider write-backs section. Lists recent writebacks for the company
// and exposes the "new writeback" form. The form is purposefully simple:
// pick a participant, pick a deferral source (preTax / Roth), pick
// percent or amount, pick effective date. Submit creates a draft. The
// table row then exposes Approve / Cancel as a separate explicit step.

import { useRouter } from "next/navigation";
import { useState } from "react";

type Connection = { id: string; provider: string };
type Participant = { id: string; externalEmployeeId: string; displayName: string };
type Writeback = {
  id: string;
  createdAt: string;
  requestType: string;
  status: string;
  participantName: string;
  participantExternalId: string;
  payload: Record<string, unknown>;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  providerConfirmationId: string | null;
};

export function WritebacksSection({
  activeConnections,
  participants,
  writebacks,
  canCreate,
  canApprove,
}: {
  activeConnections: Connection[];
  participants: Participant[];
  writebacks: Writeback[];
  canCreate: boolean;
  canApprove: boolean;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
            Provider write-backs
          </h2>
          <p className="mt-0.5 text-xs text-subtle">
            Push deferral election changes back to the connected payroll provider. Each request
            requires explicit approval before it&apos;s submitted; the audit log captures the full
            create → approve → provider-response chain.
          </p>
        </div>
        {canCreate && participants.length > 0 ? (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            {showForm ? "Close" : "+ New write-back"}
          </button>
        ) : null}
      </div>

      {showForm ? (
        <NewWritebackForm
          activeConnections={activeConnections}
          participants={participants}
          onDone={() => setShowForm(false)}
        />
      ) : null}

      {writebacks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-subtle">
          No write-back requests yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Participant</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Payload</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {writebacks.map((w) => (
                <tr key={w.id} className="border-t border-border align-top">
                  <td className="px-4 py-2 font-mono text-[11px] text-subtle whitespace-nowrap">
                    {w.createdAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2">
                    <div>{w.participantName}</div>
                    <div className="text-[11px] text-subtle font-mono">{w.participantExternalId}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{w.requestType}</td>
                  <td className="px-4 py-2 text-xs font-mono text-ink/80 max-w-[28ch]">
                    {summarizePayload(w.payload)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={w.status} />
                    {w.errorMessage ? (
                      <div className="mt-1 text-[11px] text-danger truncate max-w-[28ch]" title={w.errorMessage}>
                        {w.errorMessage.slice(0, 80)}
                      </div>
                    ) : null}
                    {w.providerConfirmationId ? (
                      <div className="mt-1 text-[10px] text-subtle font-mono truncate max-w-[28ch]" title={w.providerConfirmationId}>
                        conf: {w.providerConfirmationId.slice(0, 18)}…
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {w.status === "draft" ? (
                      <DraftRowActions
                        writebackId={w.id}
                        canApprove={canApprove}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function summarizePayload(p: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof p.preTaxPercent === "number") parts.push(`preTax ${p.preTaxPercent}%`);
  if (typeof p.preTaxAmount === "number") parts.push(`preTax $${p.preTaxAmount}`);
  if (typeof p.rothPercent === "number") parts.push(`Roth ${p.rothPercent}%`);
  if (typeof p.rothAmount === "number") parts.push(`Roth $${p.rothAmount}`);
  if (typeof p.effectiveDate === "string") parts.push(`@ ${p.effectiveDate.slice(0, 10)}`);
  return parts.join(" · ");
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "succeeded"
      ? "border-success/30 bg-success/10 text-success"
      : status === "failed"
        ? "border-danger/30 bg-danger/10 text-danger"
        : status === "in_flight"
          ? "border-warning/30 bg-warning/10 text-warning"
          : status === "approved"
            ? "border-brand/30 bg-brand-muted/30 text-brand"
            : status === "cancelled"
              ? "border-border bg-muted text-subtle"
              : "border-border bg-surface text-ink";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function DraftRowActions({
  writebackId,
  canApprove,
}: {
  writebackId: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function call(url: string, payload: Record<string, unknown>, kind: string) {
    setBusy(kind);
    setErr(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button
          disabled={!canApprove || busy !== null}
          title={canApprove ? "Approve and submit" : "Requires contribution.submit permission"}
          onClick={() => call(`/api/writebacks/${writebackId}/approve`, {}, "approve")}
          className="rounded-md border border-success/40 bg-success/5 px-2 py-1 text-[11px] font-medium text-success hover:bg-success/10 disabled:opacity-50"
        >
          {busy === "approve" ? "…" : "Approve"}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => {
            const reason = window.prompt("Cancellation reason (required):");
            if (!reason?.trim()) return;
            call(`/api/writebacks/${writebackId}/cancel`, { reason: reason.trim() }, "cancel");
          }}
          className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
        >
          {busy === "cancel" ? "…" : "Cancel"}
        </button>
      </div>
      {err ? <span className="text-[10px] text-danger truncate max-w-[22ch]">{err}</span> : null}
    </div>
  );
}

function NewWritebackForm({
  activeConnections,
  participants,
  onDone,
}: {
  activeConnections: Connection[];
  participants: Participant[];
  onDone: () => void;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [connectionId, setConnectionId] = useState(activeConnections[0]?.id ?? "");
  const [participantId, setParticipantId] = useState(participants[0]?.id ?? "");
  const [preTaxMode, setPreTaxMode] = useState<"none" | "percent" | "amount">("percent");
  const [preTaxValue, setPreTaxValue] = useState("");
  const [rothMode, setRothMode] = useState<"none" | "percent" | "amount">("none");
  const [rothValue, setRothValue] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = { effectiveDate };
      if (preTaxMode === "percent" && preTaxValue.trim()) {
        payload.preTaxPercent = Number(preTaxValue);
      } else if (preTaxMode === "amount" && preTaxValue.trim()) {
        payload.preTaxAmount = Number(preTaxValue);
      }
      if (rothMode === "percent" && rothValue.trim()) {
        payload.rothPercent = Number(rothValue);
      } else if (rothMode === "amount" && rothValue.trim()) {
        payload.rothAmount = Number(rothValue);
      }

      const res = await fetch(`/api/payroll-connections/${connectionId}/writebacks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          participantId,
          requestType: "deferral_election",
          payload,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      onDone();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create write-back");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand/30 bg-brand-muted/20 p-4 space-y-3">
      <h3 className="text-sm font-medium">New deferral-election write-back</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Connection">
          <select
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          >
            {activeConnections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.provider} · {c.id.slice(0, 10)}…
              </option>
            ))}
          </select>
        </Field>
        <Field label="Participant">
          <select
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          >
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} ({p.externalEmployeeId})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Effective date">
          <input
            type="date"
            value={effectiveDate}
            min={today}
            onChange={(e) => setEffectiveDate(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono"
          />
        </Field>
        <Field label="">
          <span className="text-[11px] text-subtle">
            Provider rejects effectiveDate more than 30 days in the past.
          </span>
        </Field>

        <Field label="Pre-tax 401(k)">
          <div className="flex gap-2">
            <select
              value={preTaxMode}
              onChange={(e) => setPreTaxMode(e.target.value as "none" | "percent" | "amount")}
              disabled={busy}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              <option value="none">— no change</option>
              <option value="percent">% of comp</option>
              <option value="amount">$ per payroll</option>
            </select>
            {preTaxMode !== "none" ? (
              <input
                type="number"
                min={0}
                step="0.01"
                value={preTaxValue}
                onChange={(e) => setPreTaxValue(e.target.value)}
                disabled={busy}
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono"
              />
            ) : null}
          </div>
        </Field>
        <Field label="Roth 401(k)">
          <div className="flex gap-2">
            <select
              value={rothMode}
              onChange={(e) => setRothMode(e.target.value as "none" | "percent" | "amount")}
              disabled={busy}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              <option value="none">— no change</option>
              <option value="percent">% of comp</option>
              <option value="amount">$ per payroll</option>
            </select>
            {rothMode !== "none" ? (
              <input
                type="number"
                min={0}
                step="0.01"
                value={rothValue}
                onChange={(e) => setRothValue(e.target.value)}
                disabled={busy}
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono"
              />
            ) : null}
          </div>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={
            busy ||
            !connectionId ||
            !participantId ||
            !effectiveDate ||
            (preTaxMode === "none" && rothMode === "none") ||
            (preTaxMode !== "none" && !preTaxValue.trim()) ||
            (rothMode !== "none" && !rothValue.trim())
          }
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create draft"}
        </button>
        <button
          onClick={onDone}
          disabled={busy}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        {err ? <span className="text-xs text-danger">{err}</span> : null}
      </div>
      <p className="text-[11px] text-subtle">
        Drafts aren&apos;t submitted automatically — an authorized approver must click <strong>Approve</strong> on the row below.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-subtle">
      {label}
      {children}
    </label>
  );
}

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}
