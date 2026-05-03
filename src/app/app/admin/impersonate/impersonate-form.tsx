"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ImpersonateForm({
  targetUserId,
  targetEmail,
}: {
  targetUserId: string;
  targetEmail: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/impersonation/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ targetUserId, reason: reason.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
      router.push("/app/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-brand hover:underline"
      >
        Impersonate
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={`Reason for impersonating ${targetEmail} (≥ 10 chars, will be audited)`}
        rows={3}
        className="w-64 rounded-md border border-border bg-surface px-2 py-1 text-xs"
      />
      <div className="flex gap-2 justify-end">
        <button
          disabled={busy || reason.trim().length < 10}
          onClick={start}
          className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-medium text-warning hover:bg-warning/20 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start"}
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs hover:bg-muted"
        >
          Cancel
        </button>
      </div>
      {error ? <span className="block text-xs text-danger">{error}</span> : null}
    </div>
  );
}
