import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";

import { NewRuleVersionForm } from "./new-rule-version-form";

export default async function PlanRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();

  const plan = await db.plan.findFirst({
    where: { id, company: { organizationId: actor.organizationId } },
    include: {
      company: { select: { id: true, name: true } },
      ruleVersions: { orderBy: { effectiveDate: "desc" } },
    },
  });
  if (!plan) notFound();

  const canEdit = actor.permissions.has("plan_rule.version.create");
  const today = new Date();
  const latestEffective = plan.ruleVersions[0] ?? null;

  return (
    <div className="space-y-8">
      <header>
        <Link href="/app/dashboard" className="text-xs text-subtle hover:text-ink">← Dashboard</Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Plan rules · {plan.name}</h1>
        <p className="text-sm text-subtle">
          {plan.company.name}{plan.planNumber ? ` · plan #${plan.planNumber}` : ""}
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Rule versions</h2>
          <span className="text-xs text-subtle">
            Effective dates may not be in the past. Use the correction workflow to amend prior payroll runs.
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Effective</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Plan year</th>
                <th className="px-4 py-2 font-medium">Match</th>
                <th className="px-4 py-2 font-medium">Timeliness</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {plan.ruleVersions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-subtle">
                    No rule versions yet. Create one below.
                  </td>
                </tr>
              ) : null}
              {plan.ruleVersions.map((v) => {
                const rules = v.rulesJson as Record<string, unknown>;
                const isLatest = v.id === latestEffective?.id;
                const isFuture = v.effectiveDate > today;
                return (
                  <tr key={v.id} className="border-t border-border align-top">
                    <td className="px-4 py-2 font-mono text-xs">
                      {v.effectiveDate.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          isLatest && !isFuture
                            ? "border-success/30 bg-success/10 text-success"
                            : isFuture
                              ? "border-warning/30 bg-warning/10 text-warning"
                              : "border-border bg-muted text-subtle"
                        }`}
                      >
                        {isFuture ? "scheduled" : isLatest ? "current" : "superseded"}
                      </span>
                    </td>
                    <td className="px-4 py-2">{String(rules.planYear ?? "—")}</td>
                    <td className="px-4 py-2 text-xs">{summarizeMatch(rules.matchFormula)}</td>
                    <td className="px-4 py-2 text-xs">{summarizeTimeliness(rules.timeliness)}</td>
                    <td className="px-4 py-2 text-xs text-subtle">
                      {v.createdAt.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {canEdit ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
            Create new version
          </h2>
          <div className="rounded-xl border border-border bg-surface p-6">
            <NewRuleVersionForm planId={plan.id} latestRules={(latestEffective?.rulesJson as never) ?? null} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-subtle">
          You don&apos;t have permission to edit plan rules. Contact a Firm Admin.
        </p>
      )}
    </div>
  );
}

function summarizeMatch(mf: unknown): string {
  if (!mf || typeof mf !== "object") return "—";
  const m = mf as { type?: string; flatPercent?: number; tiers?: { upToPercent: number; matchPercent: number }[] };
  if (m.type === "flat") return `flat ${m.flatPercent ?? 0}%`;
  if (m.type === "tiered" && m.tiers) {
    return m.tiers.map((t) => `${t.matchPercent}%/${t.upToPercent}%`).join(", ");
  }
  return "—";
}

function summarizeTimeliness(t: unknown): string {
  if (!t || typeof t !== "object") return "general";
  const x = t as { rule?: string; customWarningThresholdBusinessDays?: number; customCriticalBusinessDays?: number };
  if (x.rule === "small_plan_safe_harbor_7_business_days") return "small-plan 7 BD";
  if (x.rule === "general_as_soon_as_feasible") return "general (15 BD)";
  if (x.rule === "custom") return `custom ${x.customWarningThresholdBusinessDays ?? "?"}/${x.customCriticalBusinessDays ?? "?"} BD`;
  return String(x.rule ?? "—");
}
