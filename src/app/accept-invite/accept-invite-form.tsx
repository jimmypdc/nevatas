"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Summary = {
  organizationName: string;
  roleName: string;
  inviterName: string;
  email: string;
  hasExistingUser: boolean;
  expiresAt: string;
};

type Phase = "loading" | "ready" | "done" | "error";

export function AcceptInviteForm({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/invitations/lookup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
        }
        const json = (await res.json()) as Summary;
        if (!cancelled) {
          setSummary(json);
          setPhase("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not look up invitation");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    if (!summary) return;
    setError(null);
    if (!summary.hasExistingUser && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { token };
      if (!summary.hasExistingUser) {
        body.name = name;
        body.password = password;
      }
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: { message?: string; details?: { reasons?: string[] } } }
          | null;
        const reasons = j?.error?.details?.reasons;
        const detail = reasons?.length ? ` (${reasons.join(", ")})` : "";
        throw new Error((j?.error?.message ?? `${res.status} ${res.statusText}`) + detail);
      }
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return <p className="text-sm text-subtle">Looking up invitation…</p>;
  }
  if (phase === "error") {
    return (
      <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (phase === "done" && summary) {
    return (
      <div className="space-y-3">
        <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          You&apos;ve joined <strong>{summary.organizationName}</strong>.
        </p>
        <p className="text-sm">
          <Link href="/login" className="text-brand underline">Sign in</Link> to start using Nevatas.
        </p>
      </div>
    );
  }
  if (!summary) return null;

  return (
    <form onSubmit={accept} className="space-y-4">
      <div className="rounded-md border border-border bg-muted px-3 py-3 text-sm">
        <div>
          <strong>{summary.inviterName}</strong> invited <span className="font-mono">{summary.email}</span>
        </div>
        <div className="mt-1 text-subtle">
          to join <strong>{summary.organizationName}</strong> as <strong>{summary.roleName}</strong>.
        </div>
      </div>

      {summary.hasExistingUser ? (
        <p className="text-sm text-subtle">
          You already have a Nevatas account with this email — accepting will add the new
          organization to your account. You&apos;ll keep your existing password and any MFA setup.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">Full name</label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="pw" className="text-sm font-medium">Password</label>
            <input
              id="pw"
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <p className="text-xs text-subtle">
              At least 12 characters with a mix of cases, digits, and symbols.
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="pw2" className="text-sm font-medium">Confirm password</label>
            <input
              id="pw2"
              type="password"
              required
              minLength={12}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
        </>
      )}

      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || (!summary.hasExistingUser && (!name || !password || !confirm))}
        className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
      >
        {busy ? "Accepting…" : summary.hasExistingUser ? "Accept invitation" : "Create account"}
      </button>
    </form>
  );
}
