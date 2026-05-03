import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { Section } from "./_components/section";
import { ValidationReport } from "./_components/validation-report";

export default async function MarketingPage() {
  // Authenticated visitors skip the marketing surface entirely.
  const session = await auth();
  if (session?.user) redirect("/app/dashboard");

  return (
    <>
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <ValidationEngine />
      <Compliance />
      <Integrations />
      <BuiltFor />
      <TrustStrip />
      <FaqSection />
      <FinalCta />
    </>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Hero                                                       */
/* ────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative px-6 lg:px-10 pt-12 lg:pt-20 pb-20 lg:pb-28 overflow-hidden">
      {/* Decorative paper grain */}
      <div className="absolute inset-0 grain pointer-events-none" aria-hidden />
      {/* Subtle vertical guide lines, like a printer's registration marks */}
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-ink/[0.04] hidden lg:block"
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1320px]">
        {/* Top metadata bar — like a document header */}
        <div className="reveal flex items-center justify-between mono text-[10px] uppercase tracking-[0.22em] text-subtle pb-12 border-b border-ink/10">
          <span>Filing №01 · Payroll → 401(k) Operations</span>
          <span className="hidden sm:inline">Compliance-Grade Infrastructure</span>
          <span>2026 — Issue I</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-12 pt-14 lg:pt-20">
          {/* Headline */}
          <div className="lg:col-span-7">
            <p
              className="reveal mono text-[11px] uppercase tracking-[0.22em] text-brand mb-8"
              style={{ animationDelay: "0.05s" }}
            >
              ◆ Operating system for retirement plan administration
            </p>
            <h1
              className="reveal display text-[44px] sm:text-[60px] lg:text-[88px] leading-[0.92] tracking-tightest font-medium text-ink"
              style={{ animationDelay: "0.15s" }}
            >
              Connect any payroll system to any 401(k) recordkeeper.{" "}
              <span className="display-italic text-brand">
                Validate
              </span>{" "}
              the data,{" "}
              <span className="display-italic text-brand">approve</span> the
              file, and preserve a complete audit trail.
            </h1>

            <div
              className="reveal mt-10 flex flex-col sm:flex-row sm:items-center gap-4"
              style={{ animationDelay: "0.35s" }}
            >
              <a
                href="mailto:demo@nevatas.local?subject=Nevatas%20demo%20request"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-ink text-paper text-[14px] font-medium rounded-sm hover:bg-brand transition-colors group"
              >
                Book a demo
                <span className="inline-block transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </a>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-[14px] font-medium text-ink/80 hover:text-ink border border-ink/15 rounded-sm hover:border-ink/40 transition-colors"
              >
                Sign in
              </Link>
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-subtle sm:ml-2">
                Built for TPAs · RIAs · Plan&nbsp;Sponsors · Payroll&nbsp;Cos.
              </p>
            </div>
          </div>

          {/* Subhead column */}
          <aside className="lg:col-span-5 lg:pt-6">
            <div
              className="reveal border-l-2 border-ink/15 pl-6"
              style={{ animationDelay: "0.25s" }}
            >
              <p className="display text-[20px] sm:text-[22px] leading-[1.35] text-ink/85 font-normal">
                Nevatas standardizes payroll data, enforces plan rules,
                detects errors, and produces audit-ready contribution outputs
                — without ever silently mutating source data.
              </p>
            </div>

            {/* Receipt-style summary card */}
            <div
              className="reveal mt-8 bg-paper border border-ink/15 rounded-sm p-5"
              style={{ animationDelay: "0.45s" }}
            >
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-subtle pb-3 border-b border-ink/10">
                What you ship
              </p>
              <dl className="mt-4 space-y-3 text-[13px]">
                <ReceiptRow k="Per-row validation" v="20+ rules" />
                <ReceiptRow k="Recordkeeper output" v="empower · fidelity · …" />
                <ReceiptRow k="Sponsor approval" v="MFA-gated" />
                <ReceiptRow k="Audit package" v="ZIP w/ SHA-256 manifest" />
                <ReceiptRow k="Source data" v="immutable, versioned" />
              </dl>
            </div>
          </aside>
        </div>

        {/* Hero artifact */}
        <div
          className="reveal mt-16 lg:mt-24"
          style={{ animationDelay: "0.55s" }}
        >
          <div className="flex items-end justify-between mb-3">
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-subtle">
              Exhibit A — Validation report (representative)
            </p>
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-subtle hidden sm:block">
              Generated by lib/validation/engine.ts
            </p>
          </div>
          <ValidationReport />
        </div>
      </div>
    </section>
  );
}

function ReceiptRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink/70">{k}</dt>
      <dd className="mono text-[11px] text-ink text-right">{v}</dd>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §01 Problem                                                */
/* ────────────────────────────────────────────────────────── */

function ProblemSection() {
  const issues = [
    {
      tag: "401k.SPREADSHEET_ENTROPY",
      title: "Operations live in spreadsheets.",
      body:
        "Every cycle, payroll exports a CSV; an analyst hand-reconciles it against the recordkeeper template. Differences get fixed in Excel. The proof-of-correctness lives in someone's head.",
    },
    {
      tag: "ERISA.EXPOSURE",
      title: "Late-deposit risk is invisible.",
      body:
        "DOL guidance is “as soon as administratively feasible” — but no one's tracking elapsed business days. The first signal is usually a participant complaint or an audit letter.",
    },
    {
      tag: "FORMAT.FRAGMENTATION",
      title: "Every recordkeeper wants a different file.",
      body:
        "Empower's CSV is not Fidelity's CSV. Plan changes recordkeepers, the file format changes; the analyst rebuilds the mapping. New format, new errors, new month of cleanup.",
    },
    {
      tag: "AUDIT.NO_PROOF",
      title: "There is no audit trail.",
      body:
        "Who approved the May 1 cycle? Was it before or after the eligibility correction? Three people share one approval inbox; the answer is in someone's email.",
    },
  ];

  return (
    <Section
      number="01"
      eyebrow="Problem"
      title={
        <>
          Manual.{" "}
          <span className="display-italic">Risky.</span>{" "}
          Opaque.
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mt-4">
        <div className="lg:col-span-5">
          <p className="display text-[24px] sm:text-[28px] leading-[1.3] text-ink/85">
            Payroll-to-401(k) is a quarterly fire drill, run on
            spreadsheets, in inboxes, with no record of who approved what or
            when. The cost shows up at audit time.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <span className="inline-block h-px w-12 bg-ink/40" />
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-subtle">
              Common failure modes
            </p>
          </div>
        </div>

        <ul className="lg:col-span-7 divide-y divide-ink/10 border-y border-ink/15">
          {issues.map((i) => (
            <li key={i.tag} className="grid grid-cols-12 gap-6 py-6">
              <div className="col-span-12 sm:col-span-3">
                <span className="mono text-[10px] uppercase tracking-[0.16em] text-brand bg-brand-muted/60 inline-block px-1.5 py-0.5 rounded-sm">
                  {i.tag}
                </span>
              </div>
              <div className="col-span-12 sm:col-span-9">
                <h3 className="display text-[20px] leading-snug text-ink mb-1.5 font-medium">
                  {i.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-ink/75">
                  {i.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §02 How it works                                           */
/* ────────────────────────────────────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Ingest",
      kicker: "Provider-agnostic intake",
      bullets: [
        "OAuth, native API, CSV upload, SFTP",
        "Direct-browser presigned upload to S3 / R2",
        "Source bytes preserved verbatim, hashed, immutable",
        "Malware scan + CSV-injection detection on every file",
      ],
    },
    {
      n: "02",
      title: "Validate",
      kicker: "20+ compliance + integrity rules",
      bullets: [
        "IRS §402(g) limits, plan deferral caps, match formula recompute",
        "Safe-harbor formula, eligibility, loan amortization, comp basis",
        "Header-vs-line totals reconciliation",
        "Late-deposit timeliness against per-plan thresholds",
      ],
    },
    {
      n: "03",
      title: "Approve",
      kicker: "Sponsor-of-record certification",
      bullets: [
        "MFA-gated; only authorized sponsor users can approve",
        "Captures certification text + IP + UA + totals snapshot hash",
        "Blocking issues prevent approval until resolved or waived",
        "Any post-approval change auto-invalidates the certification",
      ],
    },
    {
      n: "04",
      title: "Generate",
      kicker: "Recordkeeper-shaped output",
      bullets: [
        "Per-recordkeeper templates: Empower, Fidelity, generic",
        "SHA-256 checksum on every produced file",
        "Versioned: corrections produce v2, v3 — originals locked",
        "Audit package ZIP exports the full chain on demand",
      ],
    },
  ];

  return (
    <Section
      id="how-it-works"
      number="02"
      eyebrow="How it works"
      title={
        <>
          Four operations.{" "}
          <span className="display-italic">One pipeline.</span>{" "}
          One audit trail.
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/15 border border-ink/15 rounded-sm overflow-hidden">
        {steps.map((s, idx) => (
          <article
            key={s.n}
            className="bg-paper p-7 lg:p-8 flex flex-col"
          >
            <div className="flex items-baseline justify-between mb-6">
              <span className="display text-[44px] leading-none font-medium text-ink/15">
                {s.n}
              </span>
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-subtle">
                Step
              </span>
            </div>
            <h3 className="display text-[28px] font-medium text-ink leading-tight">
              {s.title}
            </h3>
            <p className="mt-1 mono text-[10px] uppercase tracking-[0.16em] text-brand">
              {s.kicker}
            </p>
            <ul className="mt-6 space-y-2.5 text-[13px] leading-relaxed text-ink/80">
              {s.bullets.map((b) => (
                <li key={b} className="flex gap-2.5">
                  <span className="mono text-[10px] text-subtle pt-[3px]">
                    ◆
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            {idx < steps.length - 1 ? (
              <div className="mt-auto pt-6 hidden md:flex justify-end">
                <span className="mono text-[14px] text-subtle" aria-hidden>
                  →
                </span>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <p className="mt-6 mono text-[10px] uppercase tracking-[0.18em] text-subtle">
        ◆ Every transition between steps is recorded as an append-only audit event.
      </p>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §03 Validation engine                                      */
/* ────────────────────────────────────────────────────────── */

function ValidationEngine() {
  const rules = [
    {
      key: "data_quality.duplicate_employee_in_run",
      sev: "BLOCKING",
      desc:
        "An employee appears more than once in the same payroll run. Refuses to create the run until the duplicate is resolved upstream.",
    },
    {
      key: "contribution_limit.ytd_402g_elective_deferral",
      sev: "BLOCKING",
      desc:
        "Year-to-date pre-tax + Roth deferrals exceed §402(g) limit + catch-up. Warns at base limit, blocks at base + catch-up.",
    },
    {
      key: "employer_match.formula_mismatch",
      sev: "WARNING",
      desc:
        "Reported match deviates from a recompute against the plan's tiered or flat match formula by more than $0.01.",
    },
    {
      key: "safe_harbor.match_formula_mismatch",
      sev: "WARNING",
      desc:
        "Reported safe-harbor match disagrees with the basic-formula expectation, or falls below the enhanced-formula floor.",
    },
    {
      key: "eligibility.terminated_with_deferral",
      sev: "CRITICAL",
      desc:
        "Participant whose termination date precedes the payroll date still reports a non-zero deferral.",
    },
    {
      key: "loan_repayment.amount_mismatch",
      sev: "WARNING",
      desc:
        "Payroll-row loan repayment differs from the sum of active LoanSchedule expectedPaymentAmount values.",
    },
    {
      key: "payroll_timeliness.late_deposit_risk",
      sev: "WARNING",
      desc:
        "Elapsed business days since payroll date exceeds plan threshold. Honors small-plan safe harbor and general DOL framework.",
    },
    {
      key: "approval_readiness.totals_reconcile",
      sev: "BLOCKING",
      desc:
        "Header / sponsor-entered totals must equal the sum of line items within $0.01. Refuses approval otherwise.",
    },
    {
      key: "data_quality.csv_injection_risk",
      sev: "WARNING",
      desc:
        "Cells starting with =, +, -, @, tab, or carriage return — formula-injection vectors that activate when opened in Excel.",
    },
  ];

  const SEV_TONE: Record<string, string> = {
    BLOCKING: "text-danger",
    CRITICAL: "text-danger",
    WARNING: "text-warning",
    OK: "text-success",
  };

  return (
    <Section
      id="validation"
      number="03"
      eyebrow="Validation engine"
      title={
        <>
          The rules a spreadsheet{" "}
          <span className="display-italic">won't catch</span>.
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mb-12">
        <div className="lg:col-span-5">
          <p className="display text-[20px] leading-[1.45] text-ink/85">
            Every payroll run is checked against a versioned rule set. Issues
            land in the exception queue with severity, evidence, and a
            recommended resolution. The engine never silently modifies
            source data.
          </p>
        </div>
        <dl className="lg:col-span-7 grid grid-cols-3 gap-px bg-ink/15 border border-ink/15 rounded-sm overflow-hidden">
          <Stat label="Rules" value="20+" />
          <Stat label="Severities" value="04" sub="info · warning · critical · blocking" />
          <Stat label="Versioned by" value="Effective date" sub="never mutate prior payroll runs" />
        </dl>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-ink/15 border border-ink/15 rounded-sm overflow-hidden">
        {rules.map((r) => (
          <article key={r.key} className="bg-paper p-6 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span
                className={
                  "mono text-[10px] tracking-[0.14em] " +
                  (SEV_TONE[r.sev] ?? "text-ink")
                }
              >
                {r.sev}
              </span>
              <span className="mono text-[10px] uppercase tracking-[0.16em] text-subtle">
                rule
              </span>
            </div>
            <code className="mono text-[12.5px] text-ink leading-relaxed mb-3 break-all">
              {r.key}
            </code>
            <p className="text-[13px] text-ink/75 leading-relaxed">{r.desc}</p>
          </article>
        ))}
      </div>

      <p className="mt-6 mono text-[10px] uppercase tracking-[0.18em] text-subtle">
        ◆ Excerpt from src/lib/validation/rules/* — full registry available on request.
      </p>
    </Section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-paper p-6">
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-subtle">
        {label}
      </p>
      <p className="display text-[36px] sm:text-[48px] leading-none font-medium text-ink mt-3 tracking-tightest">
        {value}
      </p>
      {sub ? (
        <p className="mt-2 text-[12px] text-ink/65 leading-snug">{sub}</p>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §04 Compliance + Security                                  */
/* ────────────────────────────────────────────────────────── */

function Compliance() {
  const cards = [
    {
      title: "ERISA-safe operations",
      kicker: "By design, not by claim",
      items: [
        "Source data is preserved verbatim and never mutated",
        "Plan rules are versioned by effective date — prior runs aren't retroactively re-validated",
        "Sponsor approval is a first-class artifact: certification text, IP, UA, totals snapshot hash",
        "Approval auto-invalidates if contributions or contribution files change after approval",
        "Correction-cycle workflow re-opens approved runs without erasing history",
      ],
      footnote:
        "Nevatas does not provide ERISA legal advice. We surface operational risk; sponsors and counsel make the determinations.",
    },
    {
      title: "SOC 2-ready controls",
      kicker: "Trust services criteria, day one",
      items: [
        "Append-only audit log enforced at the Postgres trigger layer — UPDATE / DELETE / TRUNCATE all rejected",
        "AES-256-GCM envelope encryption with KMS-wrapped DEKs (env-key driver for dev, AWS KMS for prod)",
        "Argon2id password hashing + HIBP k-anonymity check + per-account lockout",
        "Stripe-style request idempotency on every mutating endpoint",
        "Tenant isolation tested against an automated cross-org fuzz suite",
      ],
      footnote:
        "Designed toward SOC 2 Type I and Type II readiness. Audit not yet completed.",
    },
    {
      title: "Sponsor approval workflow",
      kicker: "The signature that holds up",
      items: [
        "Only roles with contribution.approve can certify; the role requires MFA",
        "The certification text is captured verbatim with the approving user, IP, user agent, and a hash of the contribution rows",
        "Blocking validation issues prevent approval; waivers require an explicit reason",
        "Admin impersonation strips approve / submit / role-management permissions — admins can debug, not perjure",
        "Every action during impersonation is dual-attributed in the audit log",
      ],
      footnote:
        "Approval records are immutable and survive the deletion of the underlying organization.",
    },
  ];

  return (
    <Section
      id="compliance"
      number="04"
      eyebrow="Compliance & security"
      title={
        <>
          Built like{" "}
          <span className="display-italic">infrastructure</span>, not like a
          form-builder.
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {cards.map((c) => (
          <article
            key={c.title}
            className="bg-paper border border-ink/15 rounded-sm p-7 flex flex-col"
          >
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-brand mb-3">
              ◆ {c.kicker}
            </p>
            <h3 className="display text-[28px] leading-[1.1] text-ink font-medium tracking-tightest">
              {c.title}
            </h3>
            <ul className="mt-6 space-y-3 text-[13px] leading-relaxed text-ink/80 flex-1">
              {c.items.map((i) => (
                <li key={i} className="flex gap-3">
                  <span className="mono text-[10px] text-subtle pt-[3px] flex-none">
                    §
                  </span>
                  <span>{i}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 pt-4 border-t border-ink/10 text-[11px] text-subtle leading-relaxed italic">
              {c.footnote}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §05 Integrations                                           */
/* ────────────────────────────────────────────────────────── */

function Integrations() {
  const inputs = [
    { name: "Paycor", method: "Native API · OAuth", state: "phase 2" },
    { name: "ADP", method: "Native API · OAuth", state: "phase 3" },
    { name: "Gusto", method: "Native API · OAuth", state: "phase 3" },
    { name: "Paychex", method: "Native API · OAuth", state: "phase 3" },
    { name: "iSolved", method: "Native API · OAuth", state: "phase 3" },
    { name: "QuickBooks Payroll", method: "Native API · OAuth", state: "phase 3" },
    { name: "CSV Upload", method: "Direct-browser presigned PUT", state: "ready" },
    { name: "SFTP", method: "Scheduled drop · file-checksum verified", state: "ready" },
  ];
  const outputs = [
    { name: "Empower", method: "empower.v1 template", state: "ready" },
    { name: "Fidelity", method: "fidelity.v1 template", state: "ready" },
    { name: "Vanguard", method: "Plan-spec template (per engagement)", state: "available" },
    { name: "T. Rowe Price", method: "Plan-spec template (per engagement)", state: "available" },
    { name: "Principal", method: "Plan-spec template (per engagement)", state: "available" },
    { name: "Ascensus", method: "Plan-spec template (per engagement)", state: "available" },
    { name: "Generic CSV", method: "nevatas.v1 (canonical)", state: "ready" },
    { name: "Custom format", method: "~50-line adapter file", state: "available" },
  ];

  const STATE_TONE: Record<string, string> = {
    ready: "text-success border-success/30 bg-success/5",
    available: "text-ink border-ink/20 bg-ink/[0.03]",
    "phase 2": "text-warning border-warning/30 bg-warning/5",
    "phase 3": "text-subtle border-ink/15 bg-ink/[0.02]",
  };

  return (
    <Section
      id="integrations"
      number="05"
      eyebrow="Integrations"
      title={
        <>
          Provider-agnostic.{" "}
          <span className="display-italic">In every direction.</span>
        </>
      }
    >
      <p className="display text-[20px] leading-[1.45] text-ink/85 max-w-[60ch] mb-10">
        Each payroll provider lives behind a single adapter interface;
        each recordkeeper output behind a template. New connections land
        without touching the core data model.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-ink/15 border border-ink/15 rounded-sm overflow-hidden">
        <ManifestColumn
          title="Payroll providers — input"
          subtitle="The systems we read from"
          items={inputs}
          stateTone={STATE_TONE}
          totalLabel="src/lib/integrations/*"
        />
        <ManifestColumn
          title="Recordkeepers — output"
          subtitle="The templates we generate against"
          items={outputs}
          stateTone={STATE_TONE}
          totalLabel="src/lib/recordkeepers/templates/*"
        />
      </div>
    </Section>
  );
}

function ManifestColumn({
  title,
  subtitle,
  items,
  stateTone,
  totalLabel,
}: {
  title: string;
  subtitle: string;
  items: { name: string; method: string; state: string }[];
  stateTone: Record<string, string>;
  totalLabel: string;
}) {
  return (
    <div className="bg-paper">
      <div className="px-6 py-5 border-b border-ink/10 flex items-baseline justify-between">
        <div>
          <h3 className="display text-[22px] leading-tight font-medium text-ink">
            {title}
          </h3>
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-subtle mt-1">
            {subtitle}
          </p>
        </div>
        <span className="mono text-[10px] text-subtle hidden sm:inline">
          {String(items.length).padStart(2, "0")}
        </span>
      </div>
      <ul className="divide-y divide-ink/[0.07]">
        {items.map((i) => (
          <li
            key={i.name}
            className="px-6 py-4 grid grid-cols-12 gap-4 items-center"
          >
            <div className="col-span-5 sm:col-span-4 flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex items-center justify-center h-7 w-7 border border-ink/20 mono text-[11px] text-ink/70 rounded-sm bg-paper"
              >
                {i.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-[14px] font-medium text-ink">{i.name}</span>
            </div>
            <div className="col-span-4 sm:col-span-5 mono text-[11px] text-ink/65 leading-tight">
              {i.method}
            </div>
            <div className="col-span-3 text-right">
              <span
                className={
                  "inline-block mono text-[10px] tracking-[0.14em] uppercase px-1.5 py-0.5 border rounded-sm " +
                  (stateTone[i.state] ?? "text-ink border-ink/20")
                }
              >
                {i.state}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="px-6 py-4 border-t border-ink/10 mono text-[10px] uppercase tracking-[0.16em] text-subtle">
        ◆ {totalLabel}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §06 Built for                                              */
/* ────────────────────────────────────────────────────────── */

function BuiltFor() {
  const audiences = [
    {
      tag: "TPA",
      title: "Third-Party Administrators",
      blurb:
        "Operate dozens or hundreds of plans across many payroll systems. The same tooling, the same audit trail, every cycle.",
      bullets: [
        "Multi-tenant by org / company / plan with strict tenant isolation",
        "Per-recordkeeper output templates extend with ~50 lines of code",
        "Audit-package ZIP per cycle — the artifact you hand the auditor",
        "Correction-cycle workflow keeps every prior version intact",
      ],
    },
    {
      tag: "RIA",
      title: "RIAs & Plan Advisors",
      blurb:
        "Service the 401(k) book without touching the operational risk. Sponsors approve; you advise.",
      bullets: [
        "Read-only auditor role for advisor visibility without write access",
        "Late-deposit timeliness flagged per plan threshold (small-plan SH or general)",
        "Validation reports surfaced per cycle, comparable across clients",
        "Per-plan rule versioning — match formulas, comp definitions, eligibility",
      ],
    },
    {
      tag: "SPONSOR",
      title: "Plan Sponsors",
      blurb:
        "Sign what you can verify. Every approval is captured with the totals you saw, the file you saw, and the time you signed.",
      bullets: [
        "MFA-gated sponsor approval workflow with explicit certification text",
        "File preview before approval — see what you're certifying",
        "Blocking exceptions cannot be approved away without a documented waiver",
        "Approval auto-invalidates if anything changes downstream",
      ],
    },
  ];

  return (
    <Section
      id="built-for"
      number="06"
      eyebrow="Built for"
      title={
        <>
          The people who carry the{" "}
          <span className="display-italic">operational risk</span>.
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {audiences.map((a) => (
          <article
            key={a.tag}
            className="bg-paper border border-ink/15 rounded-sm overflow-hidden flex flex-col"
          >
            <div className="px-7 pt-7 pb-5 border-b border-ink/10">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-brand bg-brand-muted/60 inline-block px-1.5 py-0.5 rounded-sm">
                {a.tag}
              </span>
              <h3 className="display text-[26px] leading-[1.1] mt-3 font-medium text-ink tracking-tightest">
                {a.title}
              </h3>
              <p className="text-[13.5px] leading-relaxed text-ink/75 mt-2">
                {a.blurb}
              </p>
            </div>
            <ul className="px-7 py-6 space-y-3 text-[13px] leading-relaxed text-ink/80 flex-1">
              {a.bullets.map((b) => (
                <li key={b} className="flex gap-2.5">
                  <span className="mono text-[10px] text-subtle pt-[3px]">→</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Trust strip                                                */
/* ────────────────────────────────────────────────────────── */

function TrustStrip() {
  const items = [
    "Append-only audit",
    "AES-256-GCM",
    "KMS envelope encryption",
    "MFA-gated approval",
    "Argon2id + HIBP",
    "Idempotent mutations",
    "Tenant-isolation fuzz tested",
    "SOC 2-ready",
    "Dual-attribution audit",
    "Per-row validation",
    "Versioned plan rules",
  ];
  // Doubled for marquee continuity
  const all = [...items, ...items];

  return (
    <section className="border-y border-ink/15 bg-ink text-paper py-6 overflow-hidden">
      <div
        className="flex gap-10 whitespace-nowrap mono text-[11px] uppercase tracking-[0.22em] opacity-90"
        style={{
          animation: "mkt-marquee 60s linear infinite",
        }}
      >
        {all.map((item, i) => (
          <span key={i} className="flex items-center gap-10">
            <span>{item}</span>
            <span aria-hidden className="text-paper/40">
              ◆
            </span>
          </span>
        ))}
      </div>
      <style>{`
        @keyframes mkt-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mkt section [style*="mkt-marquee"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §07 FAQ                                                    */
/* ────────────────────────────────────────────────────────── */

function FaqSection() {
  const faqs = [
    {
      q: "Is Nevatas an ERISA-certified system?",
      a: "ERISA does not certify software platforms. Nevatas is designed to support ERISA-safe operations: source data is never silently mutated, plan rules are versioned by effective date, sponsor approval is captured as a first-class signed artifact, and every action lands in an append-only audit log. Determinations remain with the plan sponsor and counsel.",
    },
    {
      q: "Which payroll providers do you support today?",
      a: "CSV upload and SFTP are production-ready. Native API integrations land per Phase 2+: Paycor first, then ADP / Gusto / Paychex / iSolved / QuickBooks Payroll. Each provider lives behind a single PayrollProviderAdapter interface, so adding one is bounded work — not a re-architecture.",
    },
    {
      q: "How is participant data protected?",
      a: "Highly sensitive fields (SSN, EIN, DOB, payroll provider tokens, banking data) are encrypted with AES-256-GCM under per-record data encryption keys (DEKs); the DEKs are wrapped by a KMS-managed master key. The master key never leaves the KMS boundary. SSN-last-4 is stored separately for display so the encrypted value isn't decrypted on every render.",
    },
    {
      q: "Can I see the audit trail?",
      a: "Yes. Every state transition writes to an append-only AuditEvent table; a Postgres trigger rejects UPDATE / DELETE / TRUNCATE on that table at the database layer. The audit-package ZIP exports every event tied to a payroll run alongside source files, contribution files, approvals, and correction cycles, with a SHA-256 manifest.",
    },
    {
      q: "Do you support write-back to payroll?",
      a: "Phase 4. Read-only payroll integrations and contribution-file generation come first; bi-directional write-back (deferral elections, loan repayment changes) lands once the read-only path is stable across multiple providers. Write-back will require approval, idempotency keys, provider confirmation logging, and explicit rollback semantics.",
    },
    {
      q: "How do you handle plan rule changes?",
      a: "Rules are versioned by effective date. You never mutate a prior version — you create a new one. Backdating is rejected; corrections to historical runs flow through the correction-cycle workflow, which preserves the original artifact + adds a v2. The validation engine resolves the rule version effective on the payroll date, not the date the run is processed.",
    },
    {
      q: "Where can I read the security architecture in detail?",
      a: "We share a security-architecture brief with prospective customers under NDA. It covers tenant isolation tests, KMS / secrets-manager wiring, append-only enforcement, MFA gating, idempotency semantics, and the SOC 2 controls roadmap. Email security@nevatas.local.",
    },
  ];

  return (
    <Section
      id="faq"
      number="07"
      eyebrow="Frequently asked"
      title={
        <>
          The questions{" "}
          <span className="display-italic">compliance</span> asks first.
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <aside className="lg:col-span-3">
          <p className="display text-[18px] leading-[1.45] text-ink/85">
            If your question isn't here, ask us directly — these are the
            ones we get most often.
          </p>
          <a
            href="mailto:hello@nevatas.local?subject=Nevatas%20question"
            className="mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-brand hover:underline"
          >
            hello@nevatas.local <span aria-hidden>→</span>
          </a>
        </aside>

        <ol className="lg:col-span-9 divide-y divide-ink/15 border-y border-ink/15">
          {faqs.map((f, i) => (
            <li
              key={f.q}
              className="grid grid-cols-12 gap-6 py-7 lg:py-8"
            >
              <div className="col-span-12 sm:col-span-1">
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-subtle">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="col-span-12 sm:col-span-11">
                <h3 className="display text-[22px] sm:text-[24px] leading-[1.2] font-medium text-ink mb-3">
                  {f.q}
                </h3>
                <p className="text-[14.5px] leading-relaxed text-ink/80 max-w-[78ch]">
                  {f.a}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Final CTA                                                  */
/* ────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="px-6 lg:px-10 pt-12 pb-32 relative overflow-hidden">
      <div className="absolute inset-0 grain pointer-events-none" aria-hidden />
      <div className="relative mx-auto max-w-[1320px]">
        <hr className="rule" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-20 lg:pt-28">
          <div className="lg:col-span-8">
            <p className="mono text-[10px] uppercase tracking-[0.22em] text-brand mb-6">
              ◆ END OF FILING
            </p>
            <h2 className="display text-[48px] sm:text-[68px] lg:text-[92px] leading-[0.92] tracking-tightest font-medium text-ink">
              Run your next payroll cycle on{" "}
              <span className="display-italic text-brand">infrastructure</span>
              .
            </h2>
            <p className="mt-8 display text-[20px] sm:text-[22px] leading-[1.4] text-ink/80 max-w-[60ch]">
              Forty-five minute walkthrough. We'll show you the validation
              engine on a real payroll file, the audit-package export, and
              the approval workflow. No deck.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <a
                href="mailto:demo@nevatas.local?subject=Nevatas%20demo%20request"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-ink text-paper text-[14px] font-medium rounded-sm hover:bg-brand transition-colors group"
              >
                Book a demo
                <span className="inline-block transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </a>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 text-[14px] font-medium text-ink/80 hover:text-ink border border-ink/15 rounded-sm hover:border-ink/40 transition-colors"
              >
                Sign in to existing account
              </Link>
            </div>
          </div>

          <aside className="lg:col-span-4">
            <div className="border border-ink/15 bg-paper rounded-sm p-7">
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-subtle pb-4 border-b border-ink/10">
                What we cover in 45 minutes
              </p>
              <ol className="mt-5 space-y-4 text-[13.5px]">
                {[
                  "Upload a payroll CSV; watch the validation engine fire",
                  "Resolve / waive an exception; see the audit event land",
                  "Generate the recordkeeper file in your format",
                  "Walk through the sponsor approval certification",
                  "Open the audit-package ZIP for the full chain of evidence",
                ].map((line, idx) => (
                  <li key={line} className="flex gap-3">
                    <span className="mono text-[11px] text-subtle pt-[2px] flex-none">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="text-ink/85">{line}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 pt-4 border-t border-ink/10 text-[12px] text-subtle italic leading-relaxed">
                We bring a sample plan + sample data. You bring questions.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
