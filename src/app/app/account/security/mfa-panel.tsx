"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Phase = "idle" | "enrolling" | "showing-codes" | "disabling";

export function MfaPanel({ enabled, enrolledAt }: { enabled: boolean; enrolledAt: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enrollment, setEnrollment] = useState<{ otpauthUri: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const [disablePassword, setDisablePassword] = useState("");

  async function begin() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/account/mfa/begin", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { otpauthUri: string; secret: string };
      setEnrollment(json);
      setPhase("enrolling");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start enrollment");
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/account/mfa/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { recoveryCodes: string[] };
      setRecoveryCodes(json.recoveryCodes);
      setPhase("showing-codes");
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/account/mfa/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setDisablePassword("");
      setPhase("idle");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disable failed");
    } finally {
      setBusy(false);
    }
  }

  function finishShowingCodes() {
    setEnrollment(null);
    setRecoveryCodes(null);
    setPhase("idle");
    router.refresh();
  }

  if (phase === "showing-codes" && recoveryCodes) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-success">MFA is now enabled.</p>
        <p className="text-sm">
          Save these recovery codes somewhere safe. Each can be used <strong>once</strong> in place
          of an authenticator code if you lose access to your device. They are shown only now.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted p-3 font-mono text-sm">
          {recoveryCodes.map((c) => <div key={c}>{c}</div>)}
        </div>
        <button
          onClick={finishShowingCodes}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg"
        >
          I&apos;ve saved them
        </button>
      </div>
    );
  }

  if (phase === "enrolling" && enrollment) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Add this account to your authenticator app, then enter the 6-digit code it generates.
        </p>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-subtle">otpauth URI</div>
          <code className="block break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
            {enrollment.otpauthUri}
          </code>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-subtle">Manual entry secret</div>
          <code className="block rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
            {enrollment.secret}
          </code>
        </div>
        <div className="space-y-1">
          <label htmlFor="totp-verify" className="text-sm font-medium">Verification code</label>
          <input
            id="totp-verify"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            className="w-40 rounded-md border border-border bg-surface px-3 py-2 font-mono tracking-widest"
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <button
            disabled={busy || code.length !== 6}
            onClick={complete}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify and enable"}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setEnrollment(null);
              setPhase("idle");
            }}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === "disabling") {
    return (
      <div className="space-y-3">
        <p className="text-sm">Confirm your password to disable MFA.</p>
        <input
          type="password"
          value={disablePassword}
          onChange={(e) => setDisablePassword(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          placeholder="Current password"
          autoComplete="current-password"
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <button
            disabled={busy || !disablePassword}
            onClick={disable}
            className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            {busy ? "Disabling…" : "Disable MFA"}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setDisablePassword("");
              setPhase("idle");
            }}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div className="space-y-3">
      {enabled ? (
        <>
          <p className="text-sm">
            MFA enabled{enrolledAt ? ` on ${new Date(enrolledAt).toISOString().slice(0, 10)}` : ""}.
          </p>
          <button
            onClick={() => setPhase("disabling")}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Disable MFA
          </button>
        </>
      ) : (
        <>
          <p className="text-sm">MFA is not enabled on this account.</p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button
            disabled={busy}
            onClick={begin}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
          >
            {busy ? "Starting…" : "Enable MFA"}
          </button>
        </>
      )}
    </div>
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
