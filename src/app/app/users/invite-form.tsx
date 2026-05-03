"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ROLES = [
  { key: "firm_admin", name: "Firm Admin" },
  { key: "firm_operations_user", name: "Firm Operations User" },
  { key: "plan_sponsor_admin", name: "Plan Sponsor Admin" },
  { key: "plan_sponsor_approver", name: "Plan Sponsor Approver" },
  { key: "payroll_admin", name: "Payroll Admin" },
  { key: "read_only_auditor", name: "Read-Only Auditor" },
] as const;

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState<(typeof ROLES)[number]["key"]>("firm_operations_user");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ email, roleKey }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      setOk(`Invitation sent to ${email}.`);
      setEmail("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Role</span>
          <select
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value as (typeof ROLES)[number]["key"])}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>{r.name}</option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {okMessage ? (
        <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {okMessage}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !email}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send invitation"}
      </button>
    </form>
  );
}
