"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Policy = {
  versionId: string;
  policyName: string;
  policyDescription: string | null;
  version: number;
  publishedAt: string;
  changeSummary: string | null;
  content: string;
};

export function AcknowledgeList({ policies }: { policies: Policy[] }) {
  const router = useRouter();
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function acknowledge(versionId: string) {
    setBusy(versionId);
    setErr(null);
    try {
      const res = await fetch(`/api/security-policies/${versionId}/acknowledge`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ confirmed: true }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setAcked((prev) => {
        const next = new Set(prev);
        next.add(versionId);
        return next;
      });
      // If this was the last outstanding policy, push to dashboard so the
      // user lands somewhere useful.
      if (acked.size + 1 >= policies.length) {
        router.push("/app/dashboard");
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record acknowledgment");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {policies.map((p) => {
        const isAcked = acked.has(p.versionId);
        return (
          <article
            key={p.versionId}
            className={
              "rounded-xl border bg-surface " +
              (isAcked ? "border-success/40" : "border-border")
            }
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border p-4">
              <div>
                <h2 className="text-base font-semibold">
                  {p.policyName} <span className="ml-2 font-mono text-xs text-subtle">v{p.version}</span>
                </h2>
                {p.policyDescription ? (
                  <p className="text-xs text-subtle">{p.policyDescription}</p>
                ) : null}
                <p className="text-[11px] text-subtle font-mono mt-1">
                  published {p.publishedAt.slice(0, 16).replace("T", " ")}
                </p>
              </div>
              {isAcked ? (
                <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  ✓ acknowledged
                </span>
              ) : null}
            </header>

            {p.changeSummary ? (
              <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs italic text-ink/80">
                Change summary: {p.changeSummary}
              </div>
            ) : null}

            <pre className="whitespace-pre-wrap p-4 text-sm font-sans text-ink/85 max-h-[60vh] overflow-y-auto">
              {p.content}
            </pre>

            {!isAcked ? (
              <footer className="border-t border-border p-4">
                <button
                  onClick={() => acknowledge(p.versionId)}
                  disabled={busy !== null}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
                >
                  {busy === p.versionId ? "Recording…" : "I acknowledge"}
                </button>
              </footer>
            ) : null}
          </article>
        );
      })}
      {err ? <p className="text-xs text-danger">{err}</p> : null}
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
