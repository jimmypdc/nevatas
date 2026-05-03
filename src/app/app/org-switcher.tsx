"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Membership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  roleKey: string;
  roleName: string;
};

export function OrgSwitcher({
  memberships,
  activeOrganizationId,
}: {
  memberships: Membership[];
  activeOrganizationId: string;
}) {
  const router = useRouter();
  const active = memberships.find((m) => m.organizationId === activeOrganizationId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // No memberships at all (shouldn't happen — requireActor would have
  // thrown — but render defensively).
  if (memberships.length === 0) {
    return <span className="text-xs text-subtle">No org</span>;
  }
  // Single membership: render as static label, no dropdown.
  if (memberships.length === 1) {
    return <span title={active?.roleName}>{active?.organizationName ?? "—"}</span>;
  }

  async function switchTo(orgId: string) {
    if (orgId === activeOrganizationId) {
      setOpen(false);
      return;
    }
    setBusy(orgId);
    setError(null);
    try {
      const res = await fetch("/api/me/active-organization", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      setOpen(false);
      // Hard reload so server components re-fetch under the new org cookie.
      router.refresh();
      // Send the user back to the dashboard rather than leaving them on a
      // detail page (the resource id may not exist in the new org).
      router.push("/app/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs hover:bg-muted"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={active?.roleName}
      >
        <span>{active?.organizationName ?? "—"}</span>
        <span className="text-subtle" aria-hidden>▾</span>
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute right-0 top-full z-10 mt-1 min-w-[14rem] overflow-hidden rounded-md border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border bg-muted px-3 py-1.5 text-xxs uppercase tracking-wide text-subtle">
            Switch organization
          </div>
          <ul className="max-h-72 overflow-auto py-1">
            {memberships.map((m) => {
              const isActive = m.organizationId === activeOrganizationId;
              return (
                <li key={m.organizationId}>
                  <button
                    onClick={() => switchTo(m.organizationId)}
                    disabled={busy !== null}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-muted disabled:opacity-50 ${
                      isActive ? "bg-brand-muted" : ""
                    }`}
                    role="option"
                    aria-selected={isActive}
                  >
                    <span className="font-medium text-ink">
                      {m.organizationName}
                      {isActive ? <span className="ml-1 text-subtle">(current)</span> : null}
                      {busy === m.organizationId ? <span className="ml-1 text-subtle">…</span> : null}
                    </span>
                    <span className="font-mono text-xxs text-subtle">{m.roleName}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {error ? (
            <div className="border-t border-border bg-danger/5 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
      <style jsx>{`
        :global(.text-xxs) {
          font-size: 0.6875rem;
          line-height: 1rem;
        }
      `}</style>
    </div>
  );
}
