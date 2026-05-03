"use client";

import Link from "next/link";
import { useState } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: { message?: string; details?: { reasons?: string[] } } }
          | null;
        const reasons = j?.error?.details?.reasons;
        const detail = reasons?.length ? ` (${reasons.join(", ")})` : "";
        throw new Error((j?.error?.message ?? `${res.status} ${res.statusText}`) + detail);
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
        Password updated. <Link href="/login" className="underline">Sign in</Link> with your new password.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="space-y-1">
        <label htmlFor="pw" className="text-sm font-medium">New password</label>
        <input
          id="pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={12}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="pw2" className="text-sm font-medium">Confirm new password</label>
        <input
          id="pw2"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={12}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={busy || !password || !confirm}
        className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
      >
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
