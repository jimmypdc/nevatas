"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const INCIDENT_TYPES = [
  { value: "security", label: "Security" },
  { value: "data_integrity", label: "Data integrity" },
  { value: "integration_failure", label: "Integration failure" },
  { value: "availability", label: "Availability" },
  { value: "privacy", label: "Privacy" },
  { value: "contribution_processing", label: "Contribution processing error" },
];

const SEVERITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export function OpenIncidentForm({
  organizations,
}: {
  organizations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const nowLocal = toDatetimeLocal(new Date());

  const [organizationId, setOrganizationId] = useState("");
  const [incidentType, setIncidentType] = useState("security");
  const [severity, setSeverity] = useState("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [detectedAt, setDetectedAt] = useState(nowLocal);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/incidents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          organizationId: organizationId || null,
          incidentType,
          severity,
          title,
          description,
          detectedAt: new Date(detectedAt).toISOString(),
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { incidentId: string };
      router.push(`/app/admin/incidents/${json.incidentId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to open incident");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Affected organization (blank = platform-wide)">
          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          >
            <option value="">Platform-wide</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Detected at (UTC time on the server)">
          <input
            type="datetime-local"
            value={detectedAt}
            max={nowLocal}
            onChange={(e) => setDetectedAt(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm"
          />
        </Field>
        <Field label="Type">
          <select
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          >
            {INCIDENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Severity">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Title (short)">
        <input
          type="text"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          placeholder="e.g. KMS key rotation failed mid-batch"
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
      </Field>

      <Field label="Description (what's known right now)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          rows={5}
          placeholder="Detection signal, scope, what's affected, anything not yet known."
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !title.trim() || !description.trim()}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
        >
          {busy ? "Opening…" : "Open incident"}
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

function toDatetimeLocal(d: Date): string {
  // <input type="datetime-local"> wants YYYY-MM-DDTHH:mm in *local* time.
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}
