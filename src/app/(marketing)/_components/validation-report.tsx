// Static "validation report" mockup that anchors the hero. Uses real rule
// keys from the engine + plausible plan/employee identifiers so the audience
// reads it as a real artifact instead of a marketing illustration.

type Row = {
  severity: "BLOCKING" | "CRITICAL" | "WARNING" | "INFO" | "OK";
  rule: string;
  detail: string;
};

const ROWS: Row[] = [
  {
    severity: "BLOCKING",
    rule: "data_quality.duplicate_employee_in_run",
    detail: "E0102 appears twice in payroll run",
  },
  {
    severity: "CRITICAL",
    rule: "eligibility.terminated_with_deferral",
    detail: "E0145 terminated 2026-03-31; reports $200.00 deferral",
  },
  {
    severity: "CRITICAL",
    rule: "data_quality.zero_comp_with_deferral",
    detail: "E0073 has $0.00 gross with $100.00 deferral",
  },
  {
    severity: "WARNING",
    rule: "employer_match.formula_mismatch",
    detail: "E0044 expected $140.00 / actual $100.00",
  },
  {
    severity: "WARNING",
    rule: "loan_repayment.amount_mismatch",
    detail: "E0028 schedule $175.00 / actual $150.00",
  },
  {
    severity: "WARNING",
    rule: "payroll_timeliness.late_deposit_risk",
    detail: "5 business days elapsed; threshold 7 (small-plan SH)",
  },
  {
    severity: "INFO",
    rule: "census_payroll.active_employee_missing",
    detail: "E0181 active in census, no row this period",
  },
  {
    severity: "OK",
    rule: "approval_readiness.totals_reconcile",
    detail: "Header totals match line-item sums within $0.01",
  },
];

const SEV_TONE: Record<Row["severity"], string> = {
  BLOCKING: "text-danger border-danger/30 bg-danger/5",
  CRITICAL: "text-danger border-danger/25 bg-danger/0",
  WARNING: "text-warning border-warning/30 bg-warning/0",
  INFO: "text-subtle border-ink/15 bg-ink/0",
  OK: "text-success border-success/30 bg-success/0",
};

export function ValidationReport() {
  return (
    <div className="relative">
      {/* Underlying paper card */}
      <div className="relative bg-surface border border-ink/15 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25),_0_4px_8px_-4px_rgba(15,23,42,0.08)] rounded-sm overflow-hidden">
        {/* Header strip */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink/10 bg-paper">
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-2 w-2 rounded-full bg-danger"
              aria-hidden
            />
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-subtle">
              VALIDATION_REPORT
            </span>
            <span className="hidden sm:inline mono text-[10px] text-subtle">
              ·
            </span>
            <span className="hidden sm:inline mono text-[10px] text-subtle">
              run_id <span className="text-ink/80">acme-001-20260415-a3f1</span>
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-3 mono text-[10px] uppercase tracking-[0.18em] text-subtle">
            <span>plan 401(k) #001</span>
            <span>·</span>
            <span>EMPOWER.V1</span>
          </div>
        </div>

        {/* Column header */}
        <div className="grid grid-cols-12 px-5 py-2 mono text-[10px] uppercase tracking-[0.16em] text-subtle border-b border-ink/10">
          <div className="col-span-2">Severity</div>
          <div className="col-span-5 sm:col-span-4">Rule key</div>
          <div className="col-span-5 sm:col-span-6">Detail</div>
        </div>

        {/* Rows */}
        <ol className="divide-y divide-ink/[0.06]">
          {ROWS.map((r, i) => (
            <li
              key={r.rule + i}
              className="grid grid-cols-12 px-5 py-3 items-start scan-row"
              style={{ animationDelay: `${0.35 + i * 0.08}s` }}
            >
              <div className="col-span-2">
                <span
                  className={
                    "inline-block mono text-[10px] tracking-[0.14em] px-1.5 py-0.5 border rounded-sm " +
                    SEV_TONE[r.severity]
                  }
                >
                  {r.severity}
                </span>
              </div>
              <div className="col-span-5 sm:col-span-4 mono text-[12px] text-ink leading-relaxed pr-3 break-all">
                {r.rule}
              </div>
              <div className="col-span-5 sm:col-span-6 text-[13px] text-ink/80 leading-relaxed">
                {r.detail}
              </div>
            </li>
          ))}
        </ol>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink/10 bg-paper grid grid-cols-2 sm:grid-cols-4 gap-3 mono text-[10px] uppercase tracking-[0.16em] text-subtle">
          <Stat label="Issues" value="08" />
          <Stat label="Blocking" value="01" tone="text-danger" />
          <Stat label="Resolved" value="00" />
          <Stat label="Status" value="EXCEPTION_REVIEW" />
        </div>
      </div>

      {/* Floating stamp */}
      <div
        className="absolute -top-6 -right-4 sm:-top-8 sm:-right-8 stamp stamp-in pointer-events-none select-none"
        aria-hidden
      >
        <span>
          ERISA-safe<br />
          ◆<br />
          v1.0
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span>{label}</span>
      <span className={"text-ink " + (tone ?? "")}>{value}</span>
    </div>
  );
}
