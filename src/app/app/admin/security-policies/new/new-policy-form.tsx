"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewPolicyForm() {
  const router = useRouter();

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [changeSummary, setChangeSummary] = useState("Initial publication.");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/security-policies", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          key,
          name,
          description: description.trim() || undefined,
          initialContent: content,
          initialChangeSummary: changeSummary.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { policyId: string };
      router.push(`/app/admin/security-policies/${json.policyId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create policy");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Key (lowercase, hyphens; e.g. acceptable-use)">
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={busy}
            placeholder="acceptable-use"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono"
          />
        </Field>
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="Acceptable Use Policy"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
      </div>

      <Field label="Description (optional, shown alongside the title in the acknowledgment gate)">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
      </Field>

      <Field label="Policy content (Markdown)">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={busy}
          rows={14}
          placeholder={`# Acceptable Use Policy\n\n…`}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono"
        />
      </Field>

      <Field label="Change summary (will appear on v1 publication)">
        <input
          type="text"
          value={changeSummary}
          onChange={(e) => setChangeSummary(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !key.trim() || !name.trim() || !content.trim()}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
        >
          {busy ? "Publishing…" : "Publish policy"}
        </button>
        {err ? <span className="text-xs text-danger">{err}</span> : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-subtle">
      {label}
      {children}
    </label>
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
