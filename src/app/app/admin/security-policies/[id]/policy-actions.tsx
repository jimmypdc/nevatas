"use client";

// Publish-new-version + retire forms.

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PolicyActions({
  policyId,
  activeContent,
}: {
  policyId: string;
  activeContent: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Publish-new-version
  const [showPublish, setShowPublish] = useState(false);
  const [content, setContent] = useState(activeContent);
  const [changeSummary, setChangeSummary] = useState("");

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

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Actions</h2>

      <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h3 className="text-sm font-medium">Publish new version</h3>
        {!showPublish ? (
          <>
            <p className="text-xs text-subtle">
              Editing the content publishes a new version. All previous
              acknowledgments stay attached to v
              <span className="font-mono">(current)</span>; every active user
              will need to acknowledge the new version on next sign-in.
            </p>
            <button
              onClick={() => setShowPublish(true)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted"
            >
              Begin new version
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={busy}
              rows={18}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono"
            />
            <textarea
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="Change summary — required. What changed and why."
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  call(
                    `/api/admin/security-policies/${policyId}/versions`,
                    { content, changeSummary: changeSummary.trim() },
                    [() => setShowPublish(false), () => setChangeSummary("")],
                  )
                }
                disabled={busy || !content.trim() || !changeSummary.trim() || content === activeContent}
                className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
              >
                {busy ? "Publishing…" : "Publish"}
              </button>
              <button
                onClick={() => {
                  setShowPublish(false);
                  setContent(activeContent);
                }}
                disabled={busy}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h3 className="text-sm font-medium">Retire policy</h3>
        {!showRetire ? (
          <>
            <p className="text-xs text-subtle">
              Retires the policy. Future users won&apos;t be gated on it; the
              row + version history + acknowledgments stay for audit.
            </p>
            <button
              onClick={() => setShowRetire(true)}
              className="rounded-md border border-warning/40 bg-warning/5 px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/10"
            >
              Retire policy
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <textarea
              value={retireReason}
              onChange={(e) => setRetireReason(e.target.value)}
              rows={2}
              placeholder="Why we're retiring (replaced by X, no longer applicable, etc.)"
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  call(
                    `/api/admin/security-policies/${policyId}/retire`,
                    { reason: retireReason.trim() },
                    [() => setShowRetire(false), () => setRetireReason("")],
                  )
                }
                disabled={busy || !retireReason.trim()}
                className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/15 disabled:opacity-50"
              >
                Retire policy
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
