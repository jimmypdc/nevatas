"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ImpersonationBannerProps = {
  targetEmail: string;
  expiresAt: string;
};

export function ImpersonationBanner({ targetEmail, expiresAt }: ImpersonationBannerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/impersonation/stop", { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
      router.push("/app/admin/impersonate");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stop failed");
    } finally {
      setBusy(false);
    }
  }

  const minutesLeft = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60_000));

  return (
    <div className="border-b-2 border-danger bg-danger/10 text-danger">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2 text-sm">
        <div className="flex items-baseline gap-3">
          <span className="font-semibold uppercase tracking-wider">Impersonating</span>
          <span className="font-mono">{targetEmail}</span>
          <span className="text-xs text-danger/70">
            session expires in ~{minutesLeft} min
          </span>
        </div>
        <div className="flex items-center gap-2">
          {error ? <span className="text-xs">{error}</span> : null}
          <button
            disabled={busy}
            onClick={stop}
            className="rounded-md border border-danger/40 bg-surface px-3 py-1 text-xs font-medium hover:bg-danger/5 disabled:opacity-50"
          >
            {busy ? "Stopping…" : "Stop impersonation"}
          </button>
        </div>
      </div>
    </div>
  );
}
