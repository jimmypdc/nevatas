import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";

import {
  ApproveAction,
  GenerateAction,
  IssueAction,
  OpenCorrectionAction,
  RecordFundingAction,
} from "./run-actions";
import { FilePreview } from "./file-preview";

export default async function PayrollRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();

  const run = await db.payrollRun.findUnique({
    where: { id },
    include: {
      plan: { include: { company: true } },
      contributions: {
        include: { participant: { select: { firstName: true, lastName: true, ssnLast4: true } } },
        orderBy: { externalEmployeeId: "asc" },
      },
      validationIssues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
      contributionFiles: { orderBy: { version: "desc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      correctionCycles: { orderBy: { openedAt: "desc" } },
    },
  });
  if (!run || run.plan.company.organizationId !== actor.organizationId) notFound();

  const blocking = run.validationIssues.filter((i) => i.severity === "blocking" && i.status === "open");
  const canGenerate = blocking.length === 0 && actor.permissions.has("contribution.generate");
  const latestFile = run.contributionFiles[0] ?? null;
  const canApprove = latestFile && blocking.length === 0 && actor.permissions.has("contribution.approve");
  const canRecordFunding = actor.permissions.has("contribution.submit");
  const payrollDateIso = run.payrollDate.toISOString().slice(0, 10);

  const CORRECTABLE_STATUSES = new Set(["approved", "generated", "submitted", "accepted", "rejected"]);
  const openCycle = run.correctionCycles.find((c) => c.status === "open") ?? null;
  const canOpenCorrection =
    !openCycle &&
    CORRECTABLE_STATUSES.has(run.status) &&
    actor.permissions.has("contribution.generate");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <Link href="/app/dashboard" className="text-xs text-subtle hover:text-ink">← Dashboard</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Payroll run · {run.payrollDate.toISOString().slice(0, 10)}
          </h1>
          <p className="text-sm text-subtle">
            {run.plan.company.name} · {run.plan.name}
          </p>
        </div>
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">
          {run.status}
        </span>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Contributions" value={run.contributions.length.toString()} />
        <Stat label="Gross comp" value={`$${formatMoney(run.totalGrossComp?.toString())}`} />
        <Stat label="Total contributions" value={`$${formatMoney(run.totalContributions?.toString())}`} />
        <Stat label="Open issues" value={run.validationIssues.filter((i) => i.status === "open").length.toString()} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Validation issues</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Severity</th>
                <th className="px-4 py-2 font-medium">Rule</th>
                <th className="px-4 py-2 font-medium">Message</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {run.validationIssues.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-subtle">No issues. </td>
                </tr>
              ) : null}
              {run.validationIssues.map((i) => (
                <tr key={i.id} className="border-t border-border align-top">
                  <td className="px-4 py-2">
                    <SeverityPill severity={i.severity} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-subtle">{i.ruleKey}</td>
                  <td className="px-4 py-2">{i.message}</td>
                  <td className="px-4 py-2 text-xs text-subtle">{i.status}</td>
                  <td className="px-4 py-2">
                    <IssueAction issueId={i.id} status={i.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Contributions</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium text-right">Gross</th>
                <th className="px-4 py-2 font-medium text-right">Pre-tax</th>
                <th className="px-4 py-2 font-medium text-right">Roth</th>
                <th className="px-4 py-2 font-medium text-right">Match</th>
                <th className="px-4 py-2 font-medium text-right">Loan</th>
              </tr>
            </thead>
            <tbody>
              {run.contributions.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      {c.participant
                        ? `${c.participant.firstName} ${c.participant.lastName}`.trim()
                        : c.externalEmployeeId}
                    </div>
                    <div className="font-mono text-xs text-subtle">
                      {c.externalEmployeeId} {c.participant?.ssnLast4 ? `· ***-**-${c.participant.ssnLast4}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">${formatMoney(c.grossCompensation.toString())}</td>
                  <td className="px-4 py-2 text-right tabular-nums">${formatMoney(c.preTaxDeferral.toString())}</td>
                  <td className="px-4 py-2 text-right tabular-nums">${formatMoney(c.rothDeferral.toString())}</td>
                  <td className="px-4 py-2 text-right tabular-nums">${formatMoney(c.employerMatch.toString())}</td>
                  <td className="px-4 py-2 text-right tabular-nums">${formatMoney(c.loanRepayment.toString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {run.correctionCycles.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Correction cycles</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium">Opened</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                  <th className="px-4 py-2 font-medium">Closed</th>
                </tr>
              </thead>
              <tbody>
                {run.correctionCycles.map((c) => (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="px-4 py-2 font-mono text-xs">{c.openedAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          c.status === "open"
                            ? "border-warning/30 bg-warning/10 text-warning"
                            : c.status === "closed"
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-border bg-muted text-subtle"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">{c.reason}</td>
                    <td className="px-4 py-2 text-xs text-subtle">
                      {c.closedAt ? c.closedAt.toISOString().slice(0, 10) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">Contribution files & approval</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          {run.contributionFiles.length === 0 ? (
            <p className="text-sm text-subtle">No contribution file generated yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {run.contributionFiles.map((f) => {
                const fundingEligible =
                  canRecordFunding &&
                  f.status !== "draft" &&
                  f.status !== "rejected" &&
                  (f.status !== "generated" || f.approvedAt !== null);
                return (
                  <li key={f.id} className="space-y-2 border-b border-border pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">v{f.version} · <span className="font-mono text-xs">{f.format}</span></div>
                        <div className="font-mono text-xs text-subtle">sha256:{f.checksum.slice(0, 16)}…</div>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-subtle">{f.status}</span>
                        {f.approvedAt ? (
                          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">approved</span>
                        ) : null}
                        {f.fundedAt ? (
                          <span
                            className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success font-mono"
                            title="Date contributions landed in the plan trust account"
                          >
                            funded {f.fundedAt.toISOString().slice(0, 10)}
                          </span>
                        ) : null}
                        <a
                          href={`/api/contribution-files/${f.id}/download`}
                          className="text-brand hover:underline"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                    <FilePreview fileId={f.id} />
                    {fundingEligible ? (
                      <RecordFundingAction
                        fileId={f.id}
                        payrollDate={payrollDateIso}
                        currentFundedAt={f.fundedAt ? f.fundedAt.toISOString().slice(0, 10) : null}
                        disabled={false}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <GenerateAction runId={run.id} disabled={!canGenerate} />
            <ApproveAction fileId={latestFile?.id ?? null} disabled={!canApprove} />
            <OpenCorrectionAction runId={run.id} disabled={!canOpenCorrection} />
            {actor.permissions.has("audit.read") ? (
              <a
                href={`/api/payroll-runs/${run.id}/audit-package`}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-muted"
                title="Download a ZIP with source file, validation issues, contribution files, approvals, correction cycles, and audit events"
              >
                Download audit package
              </a>
            ) : null}
          </div>
          {openCycle ? (
            <p className="mt-3 text-xs text-warning">
              A correction cycle is open. Resolve any new exceptions, generate a new contribution file,
              and have a sponsor re-approve to close the cycle.
            </p>
          ) : null}
          {blocking.length > 0 ? (
            <p className="mt-3 text-xs text-danger">
              Resolve all blocking issues before generating or approving a contribution file.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const tone =
    severity === "blocking"
      ? "border-danger/30 bg-danger/10 text-danger"
      : severity === "critical"
        ? "border-warning/30 bg-warning/10 text-warning"
        : severity === "warning"
          ? "border-warning/20 bg-warning/5 text-warning"
          : "border-border bg-muted text-subtle";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{severity}</span>;
}

function formatMoney(s: string | null | undefined): string {
  if (!s) return "0.00";
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
