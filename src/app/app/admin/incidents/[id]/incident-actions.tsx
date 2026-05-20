"use client";

// Lifecycle + note-add + customer-notification + close forms for an open
// incident. Closed incidents render this as null upstream.

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "open" | "contained" | "resolved" | "closed";

const FORWARD_OPTIONS: Record<Status, ("contained" | "resolved")[]> = {
  open: ["contained", "resolved"],
  contained: ["resolved"],
  resolved: [],
  closed: [],
};

export function IncidentActions({
  incidentId,
  currentStatus,
  customerNotificationDecided,
  hasRootCause,
  hasContainment,
  hasResolution,
}: {
  incidentId: string;
  currentStatus: Status;
  customerNotificationDecided: boolean;
  hasRootCause: boolean;
  hasContainment: boolean;
  hasResolution: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Note
  const [note, setNote] = useState("");

  // Transition
  const [target, setTarget] = useState<"contained" | "resolved">(
    FORWARD_OPTIONS[currentStatus][0] ?? "resolved",
  );
  const [transitionNote, setTransitionNote] = useState("");

  // Customer notification
  const [showCn, setShowCn] = useState(false);
  const [cnRequired, setCnRequired] = useState(false);
  const [cnNotes, setCnNotes] = useState("");

  // Close
  const [showClose, setShowClose] = useState(false);
  const [rootCause, setRootCause] = useState("");
  const [containment, setContainment] = useState("");
  const [resolution, setResolution] = useState("");
  const [closingNote, setClosingNote] = useState("");

  async function call(
    url: string,
    payload: Record<string, unknown>,
    resetters: (() => void)[] = [],
  ) {
    setBusy(true);
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
      for (const r of resetters) r();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Actions</h2>

      {/* Add note */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h3 className="text-sm font-medium">Add note</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Investigation update, finding, mitigation tried, etc."
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
        <button
          onClick={() =>
            call(`/api/admin/incidents/${incidentId}/notes`, { note: note.trim() }, [() => setNote("")])
          }
          disabled={busy || !note.trim()}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Add note
        </button>
      </div>

      {/* Transition */}
      {FORWARD_OPTIONS[currentStatus].length > 0 ? (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
          <h3 className="text-sm font-medium">Advance status</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-subtle flex flex-col gap-1">
              Next status
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value as "contained" | "resolved")}
                disabled={busy}
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              >
                {FORWARD_OPTIONS[currentStatus].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-subtle flex-1 flex flex-col gap-1 min-w-[300px]">
              Note (optional)
              <input
                type="text"
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                placeholder="Why we're moving forward — what's been confirmed"
                disabled={busy}
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <button
              onClick={() =>
                call(
                  `/api/admin/incidents/${incidentId}/transition`,
                  { toStatus: target, note: transitionNote.trim() || undefined },
                  [() => setTransitionNote("")],
                )
              }
              disabled={busy}
              className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/15 disabled:opacity-50"
            >
              {busy ? "…" : `Move to ${target}`}
            </button>
          </div>
        </div>
      ) : null}

      {/* Customer notification */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h3 className="text-sm font-medium">
          Customer notification decision
          {customerNotificationDecided ? (
            <span className="ml-2 text-xs text-subtle">(re-record to change)</span>
          ) : null}
        </h3>
        {!showCn ? (
          <button
            onClick={() => setShowCn(true)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted"
          >
            {customerNotificationDecided ? "Re-record decision" : "Record decision"}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="cnreq"
                  checked={!cnRequired}
                  onChange={() => setCnRequired(false)}
                />
                Not required
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="cnreq"
                  checked={cnRequired}
                  onChange={() => setCnRequired(true)}
                />
                Required
              </label>
            </div>
            <textarea
              value={cnNotes}
              onChange={(e) => setCnNotes(e.target.value)}
              rows={2}
              placeholder="Reasoning: what's the customer-impact assessment, what regulation/contract drives this"
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  call(
                    `/api/admin/incidents/${incidentId}/customer-notification`,
                    { required: cnRequired, notes: cnNotes.trim() },
                    [() => setShowCn(false), () => setCnNotes("")],
                  )
                }
                disabled={busy || !cnNotes.trim()}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg disabled:opacity-50"
              >
                Record
              </button>
              <button
                onClick={() => setShowCn(false)}
                disabled={busy}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Close */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h3 className="text-sm font-medium">Close incident</h3>
        {!showClose ? (
          <>
            <p className="text-xs text-subtle">
              Closure requires the full narrative (root cause + containment + resolution).
              The closed row is the SOC 2 evidence the auditor will read.
            </p>
            <button
              onClick={() => {
                if (!customerNotificationDecided) {
                  setErr(
                    "Record a customer-notification decision before closing — auditors expect it on every closed incident.",
                  );
                  return;
                }
                setErr(null);
                setShowClose(true);
              }}
              className="rounded-md border border-success/40 bg-success/5 px-3 py-1.5 text-sm font-medium text-success hover:bg-success/10"
            >
              Begin close
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <Field label="Root cause" placeholder="What ultimately caused this">
              <textarea
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Containment actions" placeholder="What stopped it from spreading">
              <textarea
                value={containment}
                onChange={(e) => setContainment(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Resolution actions" placeholder="What restored normal operation">
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Closing note (optional)">
              <input
                type="text"
                value={closingNote}
                onChange={(e) => setClosingNote(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </Field>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  call(
                    `/api/admin/incidents/${incidentId}/close`,
                    {
                      rootCause: rootCause.trim(),
                      containmentActions: containment.trim(),
                      resolutionActions: resolution.trim(),
                      closingNote: closingNote.trim() || undefined,
                    },
                    [() => setShowClose(false)],
                  )
                }
                disabled={
                  busy ||
                  !rootCause.trim() ||
                  !containment.trim() ||
                  !resolution.trim()
                }
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg disabled:opacity-50"
              >
                Close incident
              </button>
              <button
                onClick={() => setShowClose(false)}
                disabled={busy}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
            </div>
            {(!hasRootCause || !hasContainment || !hasResolution) ? null : (
              <p className="text-xs text-subtle">
                Existing values are pre-filled above from prior drafts.
              </p>
            )}
          </div>
        )}
      </div>

      {err ? <div className="text-xs text-danger">{err}</div> : null}
    </section>
  );
}

function Field({
  label,
  placeholder,
  children,
}: {
  label: string;
  placeholder?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-subtle">
      <span>
        {label}
        {placeholder ? <span className="ml-2 text-[10px] italic">{placeholder}</span> : null}
      </span>
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
