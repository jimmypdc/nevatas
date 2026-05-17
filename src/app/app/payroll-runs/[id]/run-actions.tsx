"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function useBusyAction() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return { busy, err, run };
}

export function GenerateAction({ runId, disabled }: { runId: string; disabled: boolean }) {
  const { busy, err, run } = useBusyAction();
  return (
    <div className="flex flex-col gap-1">
      <button
        disabled={disabled || busy}
        onClick={() =>
          run(async () => {
            const res = await fetch("/api/contribution-files/generate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ payrollRunId: runId }),
            });
            if (!res.ok) throw new Error(await readError(res));
          })
        }
        className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
      >
        {busy ? "Generating…" : "Generate contribution file"}
      </button>
      {err ? <span className="text-xs text-danger">{err}</span> : null}
    </div>
  );
}

export function ApproveAction({ fileId, disabled }: { fileId: string | null; disabled: boolean }) {
  const { busy, err, run } = useBusyAction();
  const [showConfirm, setShowConfirm] = useState(false);

  if (!fileId) {
    return (
      <button disabled className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-subtle disabled:opacity-50">
        Approve (generate file first)
      </button>
    );
  }

  if (showConfirm) {
    return (
      <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
        <p className="text-ink">
          I certify that I have reviewed the payroll contribution data, exception report, and contribution
          totals for this payroll cycle and approve the generation or submission of the contribution file.
        </p>
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const res = await fetch(`/api/contribution-files/${fileId}/approve`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ acknowledgement: true }),
                });
                if (!res.ok) throw new Error(await readError(res));
                setShowConfirm(false);
              })
            }
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
          >
            {busy ? "Approving…" : "I certify and approve"}
          </button>
          <button
            disabled={busy}
            onClick={() => setShowConfirm(false)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
        </div>
        {err ? <span className="block text-xs text-danger">{err}</span> : null}
      </div>
    );
  }

  return (
    <button
      disabled={disabled}
      onClick={() => setShowConfirm(true)}
      className="rounded-md border border-success/40 bg-success/5 px-3 py-2 text-sm font-medium text-success hover:bg-success/10 disabled:opacity-50"
    >
      Approve contribution file
    </button>
  );
}

export function IssueAction({ issueId, status }: { issueId: string; status: string }) {
  const { busy, err, run } = useBusyAction();
  if (status !== "open" && status !== "in_review") {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const res = await fetch(`/api/exceptions/${issueId}/resolve`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status: "resolved" }),
              });
              if (!res.ok) throw new Error(await readError(res));
            })
          }
          className="rounded-md border border-border bg-surface px-2 py-1 hover:bg-muted disabled:opacity-50"
        >
          Resolve
        </button>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const reason = window.prompt("Waiver reason (required):");
              if (!reason) return;
              const res = await fetch(`/api/exceptions/${issueId}/resolve`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status: "waived", waiverReason: reason }),
              });
              if (!res.ok) throw new Error(await readError(res));
            })
          }
          className="rounded-md border border-border bg-surface px-2 py-1 hover:bg-muted disabled:opacity-50"
        >
          Waive
        </button>
      </div>
      {err ? <span className="text-danger">{err}</span> : null}
    </div>
  );
}

export function OpenCorrectionAction({ runId, disabled }: { runId: string; disabled: boolean }) {
  const { busy, err, run } = useBusyAction();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");

  if (showForm) {
    return (
      <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
        <p className="text-ink">
          Opening a correction cycle invalidates the current sponsor approval and reopens the run for
          re-validation. The original approval, contribution file, and audit history are preserved.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required, min 10 characters)"
          rows={3}
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
        />
        <div className="flex gap-2">
          <button
            disabled={busy || reason.trim().length < 10}
            onClick={() =>
              run(async () => {
                const res = await fetch(`/api/payroll-runs/${runId}/correction-cycles`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ reason: reason.trim() }),
                });
                if (!res.ok) throw new Error(await readError(res));
                setShowForm(false);
                setReason("");
              })
            }
            className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning hover:bg-warning/20 disabled:opacity-50"
          >
            {busy ? "Opening…" : "Open correction cycle"}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setShowForm(false);
              setReason("");
            }}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
        </div>
        {err ? <span className="block text-xs text-danger">{err}</span> : null}
      </div>
    );
  }

  return (
    <button
      disabled={disabled}
      onClick={() => setShowForm(true)}
      className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm font-medium text-warning hover:bg-warning/10 disabled:opacity-50"
    >
      Open correction cycle
    </button>
  );
}

export function RecordFundingAction({
  fileId,
  payrollDate,
  currentFundedAt,
  disabled,
}: {
  fileId: string;
  // ISO date (YYYY-MM-DD) from the server. Used as the minimum allowed
  // funding date — refusing values earlier than the payroll itself is also
  // enforced on the server.
  payrollDate: string;
  currentFundedAt: string | null;
  disabled: boolean;
}) {
  const { busy, err, run } = useBusyAction();
  const [showForm, setShowForm] = useState(false);
  // Default to today; operator typically just confirms the date off a bank
  // statement that's already in front of them.
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(currentFundedAt ?? today);

  if (showForm) {
    return (
      <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
        <p className="text-ink">
          Record the date contributions landed in the plan trust account.
          The timeliness validator measures elapsed business days against
          this date, freezing the late-deposit verdict.
        </p>
        <label className="flex items-center gap-2 text-xs text-subtle">
          Funding date
          <input
            type="date"
            value={date}
            min={payrollDate}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-sm text-ink"
          />
        </label>
        <div className="flex gap-2">
          <button
            disabled={busy || !date || date < payrollDate || date > today}
            onClick={() =>
              run(async () => {
                const res = await fetch(`/api/contribution-files/${fileId}/funded`, {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    "idempotency-key": crypto.randomUUID(),
                  },
                  body: JSON.stringify({ fundedAt: date }),
                });
                if (!res.ok) throw new Error(await readError(res));
                setShowForm(false);
              })
            }
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
          >
            {busy ? "Recording…" : currentFundedAt ? "Update funding date" : "Record funding"}
          </button>
          <button
            disabled={busy}
            onClick={() => setShowForm(false)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
        </div>
        {err ? <span className="block text-xs text-danger">{err}</span> : null}
      </div>
    );
  }

  return (
    <button
      disabled={disabled}
      onClick={() => setShowForm(true)}
      className="rounded-md border border-success/40 bg-success/5 px-3 py-2 text-sm font-medium text-success hover:bg-success/10 disabled:opacity-50"
    >
      {currentFundedAt ? "Update funding date" : "Record funding"}
    </button>
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

