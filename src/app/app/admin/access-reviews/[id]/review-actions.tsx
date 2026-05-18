"use client";

// Client components for per-item decisions + review-level complete/cancel.
// The per-item form posts on every decision change; the review-level form
// posts once on completion / cancellation.

import { useRouter } from "next/navigation";
import { useState } from "react";

type ItemView = {
  id: string;
  userEmail: string;
  roleKey: string;
  mfaEnabled: boolean;
  decision: string | null;
  decisionNote: string | null;
};

export function ItemDecisionRow({
  reviewId,
  item,
  editable,
}: {
  reviewId: string;
  item: ItemView;
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState(item.decisionNote ?? "");
  const [pending, setPending] = useState<string | null>(null);

  async function submit(decision: "confirmed" | "revoke" | "note") {
    if ((decision === "revoke" || decision === "note") && !note.trim()) {
      setErr(`A justification note is required for "${decision}".`);
      return;
    }
    setBusy(true);
    setErr(null);
    setPending(decision);
    try {
      const res = await fetch(
        `/api/admin/access-reviews/${reviewId}/items/${item.id}/decide`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({ decision, note: note.trim() || undefined }),
        },
      );
      if (!res.ok) throw new Error(await readError(res));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record decision");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-2 font-mono text-xs">{item.userEmail}</td>
      <td className="px-4 py-2 font-mono text-xs">{item.roleKey}</td>
      <td className="px-4 py-2 text-xs">
        {item.mfaEnabled ? (
          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">
            enrolled
          </span>
        ) : (
          <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-warning">
            none
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        {!editable ? (
          <DecisionBadge decision={item.decision} />
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex gap-1.5">
              <DecisionButton
                tone="ok"
                label="Confirm"
                active={item.decision === "confirmed"}
                busy={busy && pending === "confirmed"}
                onClick={() => submit("confirmed")}
              />
              <DecisionButton
                tone="warn"
                label="Note"
                active={item.decision === "note"}
                busy={busy && pending === "note"}
                onClick={() => submit("note")}
              />
              <DecisionButton
                tone="danger"
                label="Revoke"
                active={item.decision === "revoke"}
                busy={busy && pending === "revoke"}
                onClick={() => submit("revoke")}
              />
            </div>
            {err ? <span className="text-[11px] text-danger">{err}</span> : null}
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        {editable ? (
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="required for note / revoke"
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs"
          />
        ) : item.decisionNote ? (
          <span className="text-xs italic text-ink/80">&ldquo;{item.decisionNote}&rdquo;</span>
        ) : (
          <span className="text-xs text-subtle">—</span>
        )}
      </td>
      <td className="px-4 py-2" />
    </tr>
  );
}

function DecisionButton({
  tone,
  label,
  active,
  busy,
  onClick,
}: {
  tone: "ok" | "warn" | "danger";
  label: string;
  active: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const base = "rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-50";
  const activeTone =
    tone === "ok"
      ? "border-success/50 bg-success/15 text-success"
      : tone === "warn"
        ? "border-warning/50 bg-warning/15 text-warning"
        : "border-danger/50 bg-danger/15 text-danger";
  const idleTone = "border-border bg-surface text-ink/70 hover:bg-muted";
  return (
    <button onClick={onClick} disabled={busy} className={`${base} ${active ? activeTone : idleTone}`}>
      {busy ? "…" : label}
    </button>
  );
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) {
    return <span className="text-xs text-subtle">pending</span>;
  }
  const tone =
    decision === "confirmed"
      ? "border-success/30 bg-success/10 text-success"
      : decision === "revoke"
        ? "border-danger/30 bg-danger/10 text-danger"
        : "border-warning/30 bg-warning/10 text-warning";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {decision}
    </span>
  );
}

export function ReviewActions({
  reviewId,
  canComplete,
  pendingCount,
}: {
  reviewId: string;
  canComplete: boolean;
  pendingCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [notes, setNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  async function doComplete() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/access-reviews/${reviewId}/complete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setShowComplete(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to complete review");
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    if (!cancelReason.trim()) {
      setErr("Cancellation reason is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/access-reviews/${reviewId}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setShowCancel(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to cancel review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Sign off</h2>

      {showComplete ? (
        <div className="space-y-2 rounded-xl border border-success/30 bg-success/5 p-4 text-sm">
          <p className="text-ink">
            I have reviewed every active membership listed above for the period shown and recorded a
            decision (confirm, note, or revoke) on each one. By completing the review I attest that these
            decisions reflect my assessment as of today.
          </p>
          <label className="flex flex-col gap-1 text-xs text-subtle">
            Reviewer notes (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any context for the auditor — patterns noticed, follow-ups, etc."
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={doComplete}
              disabled={busy}
              className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
            >
              {busy ? "Completing…" : "I attest and complete this review"}
            </button>
            <button
              onClick={() => setShowComplete(false)}
              disabled={busy}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
          {err ? <span className="block text-xs text-danger">{err}</span> : null}
        </div>
      ) : showCancel ? (
        <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <p className="text-ink">
            Cancelling discards this review without sign-off. The row is preserved in the audit trail
            with the reason. Use this for restarts (snapshot was wrong, period was wrong, etc.) — not
            for routine completion.
          </p>
          <label className="flex flex-col gap-1 text-xs text-subtle">
            Reason (required)
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={doCancel}
              disabled={busy || !cancelReason.trim()}
              className="rounded-md border border-warning/40 bg-warning/15 px-3 py-2 text-sm font-medium text-warning hover:bg-warning/25 disabled:opacity-50"
            >
              {busy ? "Cancelling…" : "Cancel review"}
            </button>
            <button
              onClick={() => setShowCancel(false)}
              disabled={busy}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-muted"
            >
              Back
            </button>
          </div>
          {err ? <span className="block text-xs text-danger">{err}</span> : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowComplete(true)}
            disabled={!canComplete}
            title={
              canComplete
                ? "Sign off on this review."
                : `Cannot complete: ${pendingCount} item(s) still pending a decision.`
            }
            className="rounded-md border border-success/40 bg-success/5 px-3 py-2 text-sm font-medium text-success hover:bg-success/10 disabled:opacity-50"
          >
            Complete review
          </button>
          <button
            onClick={() => setShowCancel(true)}
            className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm font-medium text-warning hover:bg-warning/10"
          >
            Cancel review
          </button>
          {!canComplete ? (
            <p className="text-xs text-subtle self-center">
              {pendingCount} item{pendingCount === 1 ? "" : "s"} still pending.
            </p>
          ) : null}
        </div>
      )}
    </section>
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
