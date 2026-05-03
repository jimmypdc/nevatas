"use client";

import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": cryptoRandomKey(),
        },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      // Always show the same confirmation regardless of whether the email
      // matched a real user — disclosure would enable account enumeration.
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
        If an account exists for <span className="font-mono">{email}</span>, a reset link is on its way.
        Check your inbox in the next minute or two.
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
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={busy || !email}
        className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

function cryptoRandomKey(): string {
  // Browser-side: webcrypto.randomUUID guarantees ≥122 bits of entropy.
  return crypto.randomUUID();
}
