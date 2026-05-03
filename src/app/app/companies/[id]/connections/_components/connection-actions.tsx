"use client";

// Sync now / Disconnect buttons. After kicking off a sync, polls the
// status endpoint every 1.5s for ~30s and surfaces the verdict inline so
// the operator doesn't have to refresh.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type SyncStatus = {
  latest: {
    status: string; // queued | running | completed | failed
    summary: { runsCreated?: number; employeesUpserted?: number } | null;
    errorMessage: string | null;
    completedAt: string | null;
  } | null;
};

export function ConnectionActions({
  connectionId,
  provider,
  canSync,
  canDisconnect,
}: {
  connectionId: string;
  provider: string;
  canSync: boolean;
  canDisconnect: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollHandle.current) clearInterval(pollHandle.current);
    };
  }, []);

  async function startSync() {
    setError(null);
    setBusy("sync");
    setStatus("queued");
    try {
      const res = await fetch(`/api/payroll-connections/${connectionId}/sync`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await readError(res));

      // Poll for completion. Worker drains the queue on its own cadence;
      // we just wait for the SyncJob row to flip to a terminal state.
      const startedAt = Date.now();
      const tick = async () => {
        if (Date.now() - startedAt > 30_000) {
          if (pollHandle.current) clearInterval(pollHandle.current);
          setStatus("timeout");
          setBusy(null);
          return;
        }
        try {
          const sres = await fetch(`/api/payroll-connections/${connectionId}/sync-status`);
          if (!sres.ok) return;
          const sjson = (await sres.json()) as SyncStatus;
          const latest = sjson.latest;
          if (!latest) return;
          if (latest.status === "completed" || latest.status === "failed") {
            if (pollHandle.current) clearInterval(pollHandle.current);
            const summary = latest.summary;
            if (latest.status === "completed") {
              const emp = summary?.employeesUpserted ?? 0;
              const runs = summary?.runsCreated ?? 0;
              setStatus(`✓ Synced ${emp} employee${emp === 1 ? "" : "s"} · ${runs} new run${runs === 1 ? "" : "s"}`);
            } else {
              setStatus(`✗ Failed`);
              setError(latest.errorMessage ?? "Unknown error");
            }
            setBusy(null);
            // Pull the page state in case any new payroll runs landed.
            router.refresh();
          } else {
            setStatus(latest.status);
          }
        } catch {
          // Transient — let the next tick try again.
        }
      };
      pollHandle.current = setInterval(tick, 1500);
      // Run one immediately so the UI doesn't sit idle for 1.5s.
      void tick();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
      setStatus(null);
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${provider}? Stored OAuth tokens will be wiped. The audit trail of past syncs is preserved.`)) {
      return;
    }
    setError(null);
    setBusy("disconnect");
    try {
      const res = await fetch(`/api/payroll-connections/${connectionId}/disconnect`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
      });
      if (!res.ok) throw new Error(await readError(res));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <button
          disabled={!canSync || busy !== null}
          onClick={startSync}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
        >
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </button>
        <button
          disabled={!canDisconnect || busy !== null}
          onClick={disconnect}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink/80 hover:border-danger hover:text-danger disabled:opacity-50"
        >
          {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
      {status ? (
        <span className="text-xs text-subtle font-mono">{status}</span>
      ) : null}
      {error ? <span className="text-xs text-danger max-w-[40ch] truncate">{error}</span> : null}
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
