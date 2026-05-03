"use client";

import { useState } from "react";

type Preview = {
  fileId: string;
  version: number;
  format: string;
  sizeBytes: number;
  totalLines: number;
  truncated: boolean;
  head: string[];
  tail: string[];
};

export function FilePreview({ fileId }: { fileId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  async function load() {
    if (preview) {
      setOpen((o) => !o);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contribution-files/${fileId}/preview`);
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      setPreview((await res.json()) as Preview);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={load}
        disabled={busy}
        className="text-xs text-brand hover:underline disabled:opacity-50"
      >
        {busy ? "Loading preview…" : open ? "Hide preview" : "Show preview"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {open && preview ? (
        <div className="space-y-1">
          <div className="text-xs text-subtle">
            {preview.totalLines} line{preview.totalLines === 1 ? "" : "s"}, {formatBytes(preview.sizeBytes)}
            {preview.truncated ? " (preview truncated for size)" : ""}
          </div>
          <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs whitespace-pre">
{preview.head.join("\n")}
{preview.tail.length > 0 ? `\n…\n${preview.tail.join("\n")}` : ""}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
