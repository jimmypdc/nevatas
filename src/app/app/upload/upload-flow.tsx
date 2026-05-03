"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CONTRIBUTION_FIELDS } from "@/lib/normalization/contribution-fields";

type Company = { id: string; name: string; plans: { id: string; name: string }[] };

type ParseResult = {
  sourceFileId: string;
  rowCount: number;
  headers: string[];
  suggestedMapping: Record<string, string>;
  parseErrors: { row: number; message: string }[];
};

type RunResult = {
  payrollRunId: string;
  status: string;
  contributionCount: number;
  validationCounts: Record<string, number>;
  hasBlocking: boolean;
};

type Step = "upload" | "map" | "totals" | "done";

type TotalsKey = "grossCompensation" | "preTaxDeferral" | "rothDeferral" | "employerMatch" | "loanRepayment";

type Totals = Record<TotalsKey, number>;

type PreviewTotalsResult = {
  rowCount: number;
  normalizedCount: number;
  parseIssueCount: number;
  computed: Totals;
};

const TOTALS_FIELDS: { key: TotalsKey; label: string }[] = [
  { key: "grossCompensation", label: "Gross compensation" },
  { key: "preTaxDeferral", label: "Pre-tax deferral" },
  { key: "rothDeferral", label: "Roth deferral" },
  { key: "employerMatch", label: "Employer match" },
  { key: "loanRepayment", label: "Loan repayment" },
];

function emptyTotals(): Totals {
  return {
    grossCompensation: 0,
    preTaxDeferral: 0,
    rothDeferral: 0,
    employerMatch: 0,
    loanRepayment: 0,
  };
}

export function UploadFlow({
  companies,
  initialCompanyId,
}: {
  companies: Company[];
  initialCompanyId: string;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string>(initialCompanyId);
  const company = companies.find((c) => c.id === companyId) ?? null;
  const [planId, setPlanId] = useState<string>(company?.plans[0]?.id ?? "");

  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewTotalsResult | null>(null);
  const [reportedTotals, setReportedTotals] = useState<Totals>(emptyTotals());
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  function reset() {
    setStep("upload");
    setParseResult(null);
    setMapping({});
    setPreview(null);
    setReportedTotals(emptyTotals());
    setRunResult(null);
    setError(null);
  }

  async function handleUpload(formData: FormData) {
    setError(null);
    setBusy(true);
    try {
      const file = formData.get("file");
      if (!(file instanceof File)) throw new Error("No file selected");

      // 1) Hash bytes locally with Web Crypto so the server can constrain
      //    the presigned upload to this exact content.
      const sha256Hex = await sha256OfFile(file);

      // 2) Init: server returns a presigned PUT URL + required headers.
      const initRes = await fetch("/api/files/upload-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId,
          importType: "contribution",
          fileName: file.name,
          mimeType: file.type || "text/csv",
          sizeBytes: file.size,
          sha256Hex,
        }),
      });
      if (!initRes.ok) throw new Error(await readError(initRes));
      const init = (await initRes.json()) as {
        pendingUploadId: string;
        upload: { uploadUrl: string; method: "PUT"; requiredHeaders: Record<string, string> };
      };

      // 3) PUT bytes directly to storage. Skips the app server entirely in
      //    production — only the headers + URL came through us.
      const putRes = await fetch(init.upload.uploadUrl, {
        method: "PUT",
        headers: init.upload.requiredHeaders,
        body: file,
      });
      if (!putRes.ok) throw new Error(`Storage upload failed: ${putRes.status} ${putRes.statusText}`);

      // 4) Complete: server verifies via HeadObject + creates the SourceFile row.
      //    With the noop scanner the response carries the verdict inline; with
      //    real scanners it carries scanStatus="pending" and we poll.
      const completeRes = await fetch("/api/files/upload-complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pendingUploadId: init.pendingUploadId }),
      });
      if (!completeRes.ok) throw new Error(await readError(completeRes));
      const completed = (await completeRes.json()) as {
        sourceFileId: string;
        scanStatus?: string;
      };

      // 5) Resolve the malware-scan verdict. Skip the poll loop when the
      //    response already carried a terminal status.
      const verdict =
        completed.scanStatus && completed.scanStatus !== "pending"
          ? completed.scanStatus
          : await pollScanStatus(completed.sourceFileId);
      if (verdict === "infected") {
        throw new Error(
          "Malware scan flagged this file. Contact a Firm Admin to override or replace it.",
        );
      }
      if (verdict === "error") {
        throw new Error("Malware scan failed; ask a Firm Admin to retry or override.");
      }

      // 6) Parse the now-stored file and continue with the existing flow.
      const parseRes = await fetch(`/api/files/${completed.sourceFileId}/parse`, { method: "POST" });
      if (!parseRes.ok) throw new Error(await readError(parseRes));
      const parsed = (await parseRes.json()) as ParseResult;

      setParseResult(parsed);
      setMapping(parsed.suggestedMapping);
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function pollScanStatus(sourceFileId: string): Promise<string> {
    // Poll every 1.5s for up to 60s. Real scans (ClamAV) typically resolve
    // within a couple of seconds; AWS GuardDuty within ~30s.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const res = await fetch(`/api/files/${sourceFileId}/status`);
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { scanStatus: string; scanOverrideAt?: string | null };
      if (json.scanStatus !== "pending" || json.scanOverrideAt) {
        return json.scanOverrideAt ? "clean" : json.scanStatus;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error("Malware scan did not complete within 60 seconds.");
  }

  async function sha256OfFile(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function handleContinueToTotals() {
    if (!parseResult) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/files/${parseResult.sourceFileId}/preview-totals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as PreviewTotalsResult;
      setPreview(json);
      // Pre-fill the form with the computed line-item sums so the operator can
      // confirm or override against the source file's header/summary totals.
      setReportedTotals({ ...json.computed });
      setStep("totals");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compute totals preview");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateRun() {
    if (!parseResult || !planId) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/payroll-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId,
          planId,
          sourceFileId: parseResult.sourceFileId,
          mapping,
          reportedTotals,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const run = (await res.json()) as RunResult;
      setRunResult(run);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create payroll run");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />
      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {step === "upload" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleUpload(new FormData(e.currentTarget));
          }}
          className="space-y-4 rounded-xl border border-border bg-surface p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company">
              <select
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  const c = companies.find((c) => c.id === e.target.value);
                  setPlanId(c?.plans[0]?.id ?? "");
                }}
                className="select"
                required
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Plan">
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="select" required>
                {(company?.plans ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Payroll contribution CSV">
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-fg"
            />
          </Field>
          <button
            type="submit"
            disabled={busy || !companyId || !planId}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload & parse"}
          </button>
        </form>
      ) : null}

      {step === "map" && parseResult ? (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Map columns</h2>
              <p className="text-xs text-subtle">
                {parseResult.rowCount} rows • {parseResult.headers.length} headers
              </p>
            </div>
            <button onClick={reset} className="text-xs text-subtle hover:text-ink underline-offset-2 hover:underline">
              Start over
            </button>
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Canonical field</th>
                  <th className="px-3 py-2 font-medium">Required</th>
                  <th className="px-3 py-2 font-medium">Source header</th>
                </tr>
              </thead>
              <tbody>
                {CONTRIBUTION_FIELDS.map((f) => (
                  <tr key={f.key} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{f.label}</div>
                      <div className="font-mono text-xs text-subtle">{f.key}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-subtle">{f.required ? "Yes" : ""}</td>
                    <td className="px-3 py-2">
                      <select
                        value={mapping[f.key] ?? ""}
                        onChange={(e) =>
                          setMapping((m) => {
                            const next = { ...m };
                            if (e.target.value) next[f.key] = e.target.value;
                            else delete next[f.key];
                            return next;
                          })
                        }
                        className="select"
                      >
                        <option value="">— not mapped —</option>
                        {parseResult.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleContinueToTotals}
            disabled={busy}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
          >
            {busy ? "Computing totals…" : "Continue to totals"}
          </button>
        </div>
      ) : null}

      {step === "totals" && preview ? (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Confirm totals</h2>
              <p className="text-xs text-subtle">
                Enter the totals printed on the source file&apos;s header or summary row.
                Values that don&apos;t match the line-item sum within $0.01 will create a blocking
                reconciliation issue on the payroll run.
              </p>
            </div>
            <button
              onClick={() => setStep("map")}
              className="text-xs text-subtle hover:text-ink underline-offset-2 hover:underline"
            >
              Back to mapping
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 text-xs text-subtle sm:grid-cols-3">
            <div className="rounded-md border border-border bg-muted px-3 py-2">
              <div className="uppercase tracking-wide">Rows in file</div>
              <div className="mt-1 text-base font-semibold tabular-nums text-ink">{preview.rowCount}</div>
            </div>
            <div className="rounded-md border border-border bg-muted px-3 py-2">
              <div className="uppercase tracking-wide">Normalized</div>
              <div className="mt-1 text-base font-semibold tabular-nums text-ink">{preview.normalizedCount}</div>
            </div>
            <div className="rounded-md border border-border bg-muted px-3 py-2">
              <div className="uppercase tracking-wide">Parse issues</div>
              <div
                className={`mt-1 text-base font-semibold tabular-nums ${
                  preview.parseIssueCount > 0 ? "text-warning" : "text-ink"
                }`}
              >
                {preview.parseIssueCount}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium text-right">Computed from rows</th>
                  <th className="px-3 py-2 font-medium text-right">Reported on source file</th>
                  <th className="px-3 py-2 font-medium text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {TOTALS_FIELDS.map((f) => {
                  const computed = preview.computed[f.key];
                  const reported = reportedTotals[f.key];
                  const diff = Math.round((reported - computed) * 100) / 100;
                  const matched = Math.abs(diff) <= 0.01;
                  return (
                    <tr key={f.key} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{f.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-subtle">
                        ${computed.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={Number.isFinite(reported) ? reported : 0}
                          onChange={(e) =>
                            setReportedTotals((t) => ({
                              ...t,
                              [f.key]: Number(e.target.value) || 0,
                            }))
                          }
                          className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono text-sm focus:border-brand focus:outline-none"
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          matched ? "text-success" : "text-danger"
                        }`}
                      >
                        {matched ? "match" : `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => setReportedTotals({ ...preview.computed })}
              className="rounded-md border border-border bg-surface px-2 py-1 hover:bg-muted"
            >
              Reset to computed
            </button>
            <button
              onClick={() => setReportedTotals(emptyTotals())}
              className="rounded-md border border-border bg-surface px-2 py-1 hover:bg-muted"
            >
              Clear all
            </button>
          </div>

          <button
            onClick={handleCreateRun}
            disabled={busy}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
          >
            {busy ? "Creating run…" : "Create payroll run"}
          </button>
        </div>
      ) : null}

      {step === "done" && runResult ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Payroll run created</h2>
          <ul className="space-y-1 text-sm text-subtle">
            <li>Status: <span className="font-mono">{runResult.status}</span></li>
            <li>Contributions: {runResult.contributionCount}</li>
            <li>
              Validation issues: {Object.entries(runResult.validationCounts).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}
            </li>
          </ul>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/app/payroll-runs/${runResult.payrollRunId}`)}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg"
            >
              Open payroll run
            </button>
            <button
              onClick={reset}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Upload another
            </button>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .select {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid hsl(220 14% 90%);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .select:focus {
          outline: none;
          border-color: hsl(222 70% 38%);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Stepper({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "upload", label: "1. Upload" },
    { key: "map", label: "2. Map columns" },
    { key: "totals", label: "3. Confirm totals" },
    { key: "done", label: "4. Validate & create run" },
  ];
  const idx = items.findIndex((i) => i.key === step);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {items.map((it, i) => (
        <li
          key={it.key}
          className={`rounded-full border px-3 py-1 font-medium ${
            i <= idx ? "border-brand text-brand" : "border-border text-subtle"
          }`}
        >
          {it.label}
        </li>
      ))}
    </ol>
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
