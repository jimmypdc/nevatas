"use client";

// Pure client form that POSTs to /api/admin/access-reviews and navigates
// to the new review's detail page on success.

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartReviewForm({
  organizations,
}: {
  organizations: { id: string; name: string; activeMemberCount: number }[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600_000).toISOString().slice(0, 10);

  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState(ninetyDaysAgo);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/access-reviews", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ organizationId: orgId, periodStart, periodEnd }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { reviewId: string };
      router.push(`/app/admin/access-reviews/${json.reviewId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to start review");
      setBusy(false);
    }
  }

  if (organizations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-subtle">
        No organizations exist yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-subtle sm:col-span-2">
          Organization
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            disabled={busy}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.activeMemberCount} active)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-subtle">
          Period start
          <input
            type="date"
            value={periodStart}
            max={periodEnd}
            onChange={(e) => setPeriodStart(e.target.value)}
            disabled={busy}
            className="rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-subtle">
          Period end
          <input
            type="date"
            value={periodEnd}
            min={periodStart}
            max={today}
            onChange={(e) => setPeriodEnd(e.target.value)}
            disabled={busy}
            className="rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-ink"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !orgId || !periodStart || !periodEnd || periodStart >= periodEnd}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start review"}
        </button>
        {err ? <span className="text-xs text-danger">{err}</span> : null}
      </div>
    </div>
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
