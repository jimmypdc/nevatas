"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LatestRules = {
  planYear?: number;
  irsElectiveDeferralLimit?: number;
  irsCatchUpLimit50Plus?: number;
  maxEmployeeDeferralPercent?: number;
  matchFormula?: {
    type: "tiered" | "flat";
    flatPercent?: number;
    tiers?: { upToPercent: number; matchPercent: number }[];
  };
  safeHarborType?: "basic_match" | "enhanced_match" | "nonelective_3pct" | "none";
  timeliness?: {
    rule: "small_plan_safe_harbor_7_business_days" | "general_as_soon_as_feasible" | "custom";
    customWarningThresholdBusinessDays?: number;
    customCriticalBusinessDays?: number;
  };
  participantCount?: number;
} | null;

type MatchType = "none" | "flat" | "tiered";
type TimelinessRule = "small_plan_safe_harbor_7_business_days" | "general_as_soon_as_feasible" | "custom";

export function NewRuleVersionForm({ planId, latestRules }: { planId: string; latestRules: LatestRules }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [planYear, setPlanYear] = useState(latestRules?.planYear ?? new Date().getUTCFullYear());
  const [irsElectiveDeferralLimit, setIrsElective] = useState(latestRules?.irsElectiveDeferralLimit ?? 23_500);
  const [irsCatchUpLimit50Plus, setIrsCatchUp] = useState(latestRules?.irsCatchUpLimit50Plus ?? 7_500);
  const [maxEmployeeDeferralPercent, setMaxPct] = useState(latestRules?.maxEmployeeDeferralPercent ?? 100);
  const [participantCount, setParticipantCount] = useState<number | "">(latestRules?.participantCount ?? "");

  const initialMatchType: MatchType =
    latestRules?.matchFormula?.type ?? (latestRules?.matchFormula ? "tiered" : "none");
  const [matchType, setMatchType] = useState<MatchType>(initialMatchType);
  const [flatPercent, setFlatPercent] = useState<number>(latestRules?.matchFormula?.flatPercent ?? 4);
  const [tiers, setTiers] = useState<{ upToPercent: number; matchPercent: number }[]>(
    latestRules?.matchFormula?.tiers ?? [
      { upToPercent: 3, matchPercent: 100 },
      { upToPercent: 5, matchPercent: 50 },
    ],
  );

  const [safeHarborType, setSafeHarborType] = useState(latestRules?.safeHarborType ?? "none");

  const [timelinessRule, setTimelinessRule] = useState<TimelinessRule>(
    latestRules?.timeliness?.rule ?? "general_as_soon_as_feasible",
  );
  const [customWarning, setCustomWarning] = useState<number>(
    latestRules?.timeliness?.customWarningThresholdBusinessDays ?? 5,
  );
  const [customCritical, setCustomCritical] = useState<number>(
    latestRules?.timeliness?.customCriticalBusinessDays ?? 10,
  );

  function buildPayload() {
    const rules: Record<string, unknown> = {
      planYear,
      irsElectiveDeferralLimit,
      irsCatchUpLimit50Plus,
      maxEmployeeDeferralPercent,
    };
    if (typeof participantCount === "number" && participantCount >= 0) {
      rules.participantCount = participantCount;
    }
    if (matchType === "flat") {
      rules.matchFormula = { type: "flat", flatPercent };
    } else if (matchType === "tiered") {
      rules.matchFormula = { type: "tiered", tiers };
    }
    if (safeHarborType && safeHarborType !== "none") rules.safeHarborType = safeHarborType;
    if (timelinessRule === "custom") {
      rules.timeliness = {
        rule: "custom",
        customWarningThresholdBusinessDays: customWarning,
        customCriticalBusinessDays: customCritical,
      };
    } else {
      rules.timeliness = { rule: timelinessRule };
    }
    return rules;
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${planId}/rules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ effectiveDate, rules: buildPayload() }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { id: string; effectiveDate: string };
      setSuccess(`Created version effective ${json.effectiveDate.slice(0, 10)}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create rule version");
    } finally {
      setBusy(false);
    }
  }

  function updateTier(idx: number, patch: Partial<{ upToPercent: number; matchPercent: number }>) {
    setTiers((curr) => curr.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Effective date">
          <input
            type="date"
            min={today}
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Plan year">
          <input
            type="number"
            min={2020}
            max={2100}
            value={planYear}
            onChange={(e) => setPlanYear(Number(e.target.value))}
            className="input"
          />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-subtle">IRS limits</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="402(g) elective deferral limit">
            <input
              type="number"
              min={0}
              value={irsElectiveDeferralLimit}
              onChange={(e) => setIrsElective(Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Catch-up limit (age 50+)">
            <input
              type="number"
              min={0}
              value={irsCatchUpLimit50Plus}
              onChange={(e) => setIrsCatchUp(Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Plan-level max deferral %">
            <input
              type="number"
              min={0}
              max={100}
              value={maxEmployeeDeferralPercent}
              onChange={(e) => setMaxPct(Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-subtle">Match formula</legend>
        <div className="flex gap-4 text-sm">
          {(["none", "flat", "tiered"] as MatchType[]).map((t) => (
            <label key={t} className="flex items-center gap-2">
              <input
                type="radio"
                name="match-type"
                value={t}
                checked={matchType === t}
                onChange={() => setMatchType(t)}
              />
              {t}
            </label>
          ))}
        </div>
        {matchType === "flat" ? (
          <Field label="Match percent">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={flatPercent}
              onChange={(e) => setFlatPercent(Number(e.target.value))}
              className="input w-32"
            />
          </Field>
        ) : null}
        {matchType === "tiered" ? (
          <div className="space-y-2">
            <table className="text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="pr-3 font-medium">Up to deferral %</th>
                  <th className="pr-3 font-medium">Match %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, i) => (
                  <tr key={i}>
                    <td className="pr-3">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={t.upToPercent}
                        onChange={(e) => updateTier(i, { upToPercent: Number(e.target.value) })}
                        className="input w-24"
                      />
                    </td>
                    <td className="pr-3">
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={0.1}
                        value={t.matchPercent}
                        onChange={(e) => updateTier(i, { matchPercent: Number(e.target.value) })}
                        className="input w-24"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                        className="text-xs text-subtle hover:text-danger"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() =>
                setTiers([...tiers, { upToPercent: (tiers.at(-1)?.upToPercent ?? 0) + 1, matchPercent: 0 }])
              }
              className="text-xs text-brand hover:underline"
            >
              + add tier
            </button>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-subtle">Safe harbor</legend>
        <select
          value={safeHarborType}
          onChange={(e) => setSafeHarborType(e.target.value as typeof safeHarborType)}
          className="input w-full max-w-md"
        >
          <option value="none">None</option>
          <option value="basic_match">Basic match (100% to 3% + 50% of next 2%)</option>
          <option value="enhanced_match">Enhanced match</option>
          <option value="nonelective_3pct">3% nonelective</option>
        </select>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Deposit timeliness
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Rule">
            <select
              value={timelinessRule}
              onChange={(e) => setTimelinessRule(e.target.value as TimelinessRule)}
              className="input w-full"
            >
              <option value="general_as_soon_as_feasible">General — as soon as administratively feasible</option>
              <option value="small_plan_safe_harbor_7_business_days">Small-plan safe harbor (7 business days)</option>
              <option value="custom">Custom service-agreement thresholds</option>
            </select>
          </Field>
          <Field label="Participant count (first day of plan year)">
            <input
              type="number"
              min={0}
              value={participantCount === "" ? "" : participantCount}
              onChange={(e) =>
                setParticipantCount(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="input w-32"
            />
          </Field>
        </div>
        {timelinessRule === "custom" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Warning at (business days)">
              <input
                type="number"
                min={0}
                max={60}
                value={customWarning}
                onChange={(e) => setCustomWarning(Number(e.target.value))}
                className="input w-24"
              />
            </Field>
            <Field label="Critical at (business days)">
              <input
                type="number"
                min={0}
                max={60}
                value={customCritical}
                onChange={(e) => setCustomCritical(Number(e.target.value))}
                className="input w-24"
              />
            </Field>
          </div>
        ) : null}
      </fieldset>

      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">{success}</p>
      ) : null}

      <button
        onClick={submit}
        disabled={busy}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create rule version"}
      </button>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid hsl(220 14% 90%);
          background: white;
          padding: 0.4rem 0.6rem;
          font-size: 0.875rem;
        }
        :global(.input:focus) {
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

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}
