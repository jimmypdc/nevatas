"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InvitationRowActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function revoke() {
    if (!confirm("Revoke this invitation? The recipient's link will stop working.")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/invitations/${invitationId}/revoke`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={busy}
        onClick={revoke}
        className="text-xs text-subtle hover:text-danger underline-offset-2 hover:underline disabled:opacity-50"
      >
        {busy ? "Revoking…" : "Revoke"}
      </button>
      {err ? <span className="text-xs text-danger">{err}</span> : null}
    </div>
  );
}
