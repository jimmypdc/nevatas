"use client";

// Record-review + retire forms for an active vendor.

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VendorActions({
  vendorId,
  criticality,
}: {
  vendorId: string;
  criticality: "low" | "medium" | "high" | "critical";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Review
  const [reviewNote, setReviewNote] = useState("");

  // Retire
  const [showRetire, setShowRetire] = useState(false);
  const [retireReason, setRetireReason] = useState("");

  async function call(url: string, payload: Record<string, unknown>, resetters: (() => void)[] = []) {
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

  const cadenceLabel = ({
    critical: "90-day",
    high: "180-day",
    medium: "365-day",
    low: "730-day",
  } as const)[criticality];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Actions</h2>

      <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h3 className="text-sm font-medium">Record review</h3>
        <p className="text-xs text-subtle">
          Recording a review resets the {cadenceLabel} clock. The note below
          becomes part of the audit log as evidence of the review.
        </p>
        <textarea
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          rows={3}
          placeholder="What was reviewed (security posture, SOC 2 report cycle, contract renewal). What changed since last review. Any follow-up items."
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
        <button
          onClick={() =>
            call(
              `/api/admin/vendors/${vendorId}/review`,
              { reviewNote: reviewNote.trim() },
              [() => setReviewNote("")],
            )
          }
          disabled={busy || !reviewNote.trim()}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
        >
          {busy ? "Recording…" : "Record review"}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h3 className="text-sm font-medium">Retire</h3>
        {!showRetire ? (
          <>
            <p className="text-xs text-subtle">
              Mark this vendor as no longer in use. The row stays in the
              register for audit history and is excluded from review-due
              counts.
            </p>
            <button
              onClick={() => setShowRetire(true)}
              className="rounded-md border border-warning/40 bg-warning/5 px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/10"
            >
              Retire vendor
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <textarea
              value={retireReason}
              onChange={(e) => setRetireReason(e.target.value)}
              rows={2}
              placeholder="Why we stopped using them (acquisition, contract end, replacement)."
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  call(
                    `/api/admin/vendors/${vendorId}/retire`,
                    { reason: retireReason.trim() },
                    [() => setShowRetire(false), () => setRetireReason("")],
                  )
                }
                disabled={busy || !retireReason.trim()}
                className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/15 disabled:opacity-50"
              >
                Retire vendor
              </button>
              <button
                onClick={() => setShowRetire(false)}
                disabled={busy}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {err ? <div className="text-xs text-danger">{err}</div> : null}
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
