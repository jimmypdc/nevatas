"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CATEGORIES = [
  { value: "infrastructure", label: "Infrastructure" },
  { value: "security", label: "Security" },
  { value: "communications", label: "Communications" },
  { value: "analytics", label: "Analytics" },
  { value: "payments", label: "Payments" },
  { value: "other", label: "Other" },
];

const CRITICALITIES = [
  { value: "critical", label: "Critical (90d review)" },
  { value: "high", label: "High (180d review)" },
  { value: "medium", label: "Medium (365d review)" },
  { value: "low", label: "Low (730d review)" },
];

export function NewVendorForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("infrastructure");
  const [criticality, setCriticality] = useState("medium");
  const [dataCategoriesRaw, setDataCategoriesRaw] = useState("");
  const [dpaUrl, setDpaUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const dataCategories = dataCategoriesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/vendors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          name,
          description,
          category,
          criticality,
          dataCategories,
          dpaUrl: dpaUrl.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { vendorId: string };
      router.push(`/app/admin/vendors/${json.vendorId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add vendor");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name (e.g. AWS RDS, SendGrid)">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Criticality (drives review cadence)">
          <select
            value={criticality}
            onChange={(e) => setCriticality(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          >
            {CRITICALITIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data categories (comma-separated)">
          <input
            type="text"
            value={dataCategoriesRaw}
            onChange={(e) => setDataCategoriesRaw(e.target.value)}
            disabled={busy}
            placeholder="ssn, compensation, oauth_tokens"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono"
          />
        </Field>
      </div>

      <Field label="Service description (what they do for us)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="Primary PostgreSQL database hosting + automated backups."
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="DPA URL">
          <input
            type="url"
            value={dpaUrl}
            onChange={(e) => setDpaUrl(e.target.value)}
            disabled={busy}
            placeholder="https://…"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Website URL">
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={busy}
            placeholder="https://…"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            disabled={busy}
            placeholder="security@vendor.example"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !name.trim() || !description.trim()}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add vendor"}
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
