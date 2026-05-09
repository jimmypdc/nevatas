import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Help — Nevatas",
  description:
    "Documentation, workflows, troubleshooting, and reference for Nevatas operators.",
};

const TOC: { id: string; label: string }[] = [
  { id: "quick-start", label: "Quick start" },
  { id: "demo-accounts", label: "Demo accounts" },
  { id: "upload-flow", label: "Upload & validate a payroll" },
  { id: "integrations", label: "Payroll provider integrations" },
  { id: "approval", label: "Sponsor approval" },
  { id: "corrections", label: "Correction cycles" },
  { id: "plan-rules", label: "Plan rules" },
  { id: "roles", label: "Roles & permissions" },
  { id: "validation-rules", label: "Validation rules" },
  { id: "output-formats", label: "Recordkeeper output" },
  { id: "members", label: "Members & invitations" },
  { id: "security", label: "Account security & MFA" },
  { id: "audit", label: "Audit logs & exports" },
  { id: "admin", label: "Admin tools" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "contact", label: "Get help" },
];

export default function HelpPage() {
  return (
    <div className="px-6 lg:px-10 py-12 lg:py-16">
      <div className="mx-auto max-w-[1320px]">
        {/* Page header */}
        <div className="border-b border-ink/15 pb-10 mb-12">
          <p className="mono text-[10px] uppercase tracking-[0.22em] text-brand mb-5">
            ◆ Documentation · v1.0
          </p>
          <h1 className="display text-[44px] sm:text-[60px] lg:text-[76px] leading-[0.95] tracking-tightest font-medium text-ink max-w-[20ch]">
            Help center.
          </h1>
          <p className="mt-6 display text-[20px] leading-[1.45] text-ink/80 max-w-[68ch]">
            Workflows, reference material, and troubleshooting for the people
            who run payroll cycles on Nevatas. If something isn't here,{" "}
            <a
              href="mailto:hello@nevatas.local"
              className="text-brand underline underline-offset-4 hover:no-underline"
            >
              ask us directly
            </a>
            .
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Sticky TOC */}
          <aside className="lg:col-span-3">
            <div className="lg:sticky lg:top-20">
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-subtle mb-4">
                On this page
              </p>
              <nav>
                <ol className="space-y-2 text-[13px]">
                  {TOC.map((t, i) => (
                    <li key={t.id} className="flex gap-3">
                      <span className="mono text-[10px] text-subtle pt-[3px] flex-none">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <a
                        href={`#${t.id}`}
                        className="text-ink/70 hover:text-ink transition-colors leading-snug"
                      >
                        {t.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="mt-10 pt-6 border-t border-ink/10">
                <p className="mono text-[10px] uppercase tracking-[0.2em] text-subtle mb-3">
                  Need a human?
                </p>
                <a
                  href="mailto:hello@nevatas.local"
                  className="text-[13px] text-brand hover:underline underline-offset-4"
                >
                  hello@nevatas.local →
                </a>
              </div>
            </div>
          </aside>

          {/* Content */}
          <div className="lg:col-span-9 space-y-20">
            <QuickStart />
            <DemoAccounts />
            <UploadFlow />
            <PayrollIntegrations />
            <Approval />
            <Corrections />
            <PlanRules />
            <Roles />
            <ValidationRules />
            <OutputFormats />
            <Members />
            <Security />
            <AuditExports />
            <AdminTools />
            <Troubleshooting />
            <Contact />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Layout primitives                                          */
/* ────────────────────────────────────────────────────────── */

function H({
  id,
  number,
  title,
  kicker,
}: {
  id: string;
  number: string;
  title: string;
  kicker?: string;
}) {
  return (
    <header className="border-b border-ink/15 pb-5 mb-7">
      <p className="mono text-[10px] uppercase tracking-[0.2em] text-subtle mb-3">
        §{number} {kicker ? `· ${kicker}` : ""}
      </p>
      <h2
        id={id}
        className="display text-[32px] sm:text-[40px] leading-[1.05] tracking-tightest font-medium text-ink scroll-mt-20"
      >
        {title}
      </h2>
    </header>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-[14.5px] leading-relaxed text-ink/80 max-w-[72ch]">
      {children}
    </p>
  );
}

function L({ children }: { children: ReactNode }) {
  return (
    <ul className="space-y-2.5 text-[14px] leading-relaxed text-ink/80 max-w-[72ch]">
      {children}
    </ul>
  );
}

function LI({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mono text-[10px] text-subtle pt-[6px] flex-none">◆</span>
      <span>{children}</span>
    </li>
  );
}

function OL({ children }: { children: ReactNode }) {
  return (
    <ol className="space-y-3 text-[14px] leading-relaxed text-ink/80 max-w-[72ch] [counter-reset:olstep]">
      {children}
    </ol>
  );
}

function OLI({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 [&]:[counter-increment:olstep]">
      <span className="mono text-[11px] text-subtle pt-[3px] flex-none w-7">
        <span className="before:content-[counter(olstep,decimal-leading-zero)]" />
      </span>
      <span>{children}</span>
    </li>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="mono text-[12.5px] bg-ledger/60 border border-ink/10 text-ink px-1.5 py-0.5 rounded-sm">
      {children}
    </code>
  );
}

function Pre({ children }: { children: ReactNode }) {
  return (
    <pre className="mono text-[12.5px] leading-relaxed bg-ink text-paper p-5 rounded-sm overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "danger";
  children: ReactNode;
}) {
  const map = {
    info: "border-brand/30 bg-brand-muted/40 text-ink",
    warning: "border-warning/30 bg-warning/5 text-ink",
    danger: "border-danger/30 bg-danger/5 text-ink",
  };
  const label = {
    info: "Note",
    warning: "Heads up",
    danger: "Caution",
  };
  return (
    <div
      className={"border-l-2 pl-4 py-3 text-[13.5px] leading-relaxed " + map[tone]}
    >
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-subtle mr-2">
        {label[tone]}
      </span>
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §01 Quick start                                            */
/* ────────────────────────────────────────────────────────── */

function QuickStart() {
  return (
    <section>
      <H id="quick-start" number="01" title="Quick start" />
      <P>
        Nevatas connects payroll systems to 401(k) recordkeepers. The
        canonical workflow is: ingest payroll data (CSV upload OR a
        connected payroll provider) → confirm the column mapping and totals
        → resolve any validation issues → generate the recordkeeper-shaped
        contribution file → sponsor approves → download the audit package.
        This page documents each step in detail; the sections below also
        serve as reference for individual operations.
      </P>
      <div className="mt-6">
        <P>
          If you're walking the demo end-to-end for the first time, the
          shortest happy path is:
        </P>
      </div>
      <div className="mt-4">
        <OL>
          <OLI>
            Sign in as <Code>admin@demo.local</Code>.
          </OLI>
          <OLI>
            Click <strong>Upload</strong>, choose{" "}
            <Code>examples/contributions-sample.csv</Code>, follow the three
            steps (upload → map → totals → create run).
          </OLI>
          <OLI>
            Review validation issues on the run detail page; the sample data
            deliberately produces a few.
          </OLI>
          <OLI>
            Click <strong>Generate contribution file</strong>, then{" "}
            <strong>Download audit package</strong>.
          </OLI>
        </OL>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §02 Demo accounts                                          */
/* ────────────────────────────────────────────────────────── */

function DemoAccounts() {
  const rows = [
    {
      email: "admin@demo.local",
      pw: "nevatas-admin-2026!",
      role: "Firm Admin",
      can: "Upload, validate, generate, manage members + plan rules, download audit packages",
    },
    {
      email: "approver@demo.local",
      pw: "nevatas-approver-2026!",
      role: "Plan Sponsor Approver",
      can: "Approve contribution files (the only role allowed to sign sponsor certifications). MFA required.",
    },
    {
      email: "platform@demo.local",
      pw: "nevatas-platform-2026!",
      role: "Platform Super Admin",
      can: "Everything above PLUS impersonate users (/app/admin/impersonate), view system health (/app/admin/health)",
    },
  ];
  return (
    <section>
      <H
        id="demo-accounts"
        number="02"
        title="Demo accounts"
        kicker="After running npm run db:seed"
      />
      <div className="overflow-hidden border border-ink/15 rounded-sm bg-paper">
        <table className="w-full text-[13.5px]">
          <thead className="bg-ledger/50 border-b border-ink/10 text-left mono text-[10px] uppercase tracking-[0.16em] text-subtle">
            <tr>
              <th className="px-4 py-2.5 font-normal">Email</th>
              <th className="px-4 py-2.5 font-normal">Password</th>
              <th className="px-4 py-2.5 font-normal">Role</th>
              <th className="px-4 py-2.5 font-normal">Capabilities</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.07]">
            {rows.map((r) => (
              <tr key={r.email} className="align-top">
                <td className="px-4 py-3 mono text-[12px] text-ink whitespace-nowrap">
                  {r.email}
                </td>
                <td className="px-4 py-3 mono text-[12px] text-ink/85 whitespace-nowrap">
                  {r.pw}
                </td>
                <td className="px-4 py-3 text-ink/85 whitespace-nowrap">
                  {r.role}
                </td>
                <td className="px-4 py-3 text-ink/75 leading-relaxed">{r.can}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note tone="info">
        All three are members of the same demo organization (<em>Demo TPA</em>),
        which holds two companies (Acme Industries, Beta Manufacturing). The
        approver account starts with MFA disabled for demo simplicity —
        production approvals require MFA.
      </Note>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §03 Upload flow                                            */
/* ────────────────────────────────────────────────────────── */

function UploadFlow() {
  return (
    <section>
      <H id="upload-flow" number="03" title="Upload & validate a payroll" />
      <P>
        The upload UI is a 5-step flow. Bytes go directly from the browser to
        S3/R2 (or a local file in dev) via a presigned URL — they never
        traverse the application server, so payroll CSVs of any size up to
        50 MB upload cleanly even on Vercel.
      </P>
      <div className="mt-6">
        <OL>
          <OLI>
            <strong>Pick a company + file.</strong> The browser computes a
            SHA-256 of the file using the Web Crypto API.
          </OLI>
          <OLI>
            <strong>Initialize.</strong> The server validates size + MIME +
            checksum format, generates a unique storage key, returns a
            presigned PUT URL with the checksum embedded as a constraint
            (S3 itself rejects mismatched bytes).
          </OLI>
          <OLI>
            <strong>Upload.</strong> The browser PUTs the bytes directly to
            storage with the required headers.
          </OLI>
          <OLI>
            <strong>Complete.</strong> The server confirms the object via{" "}
            <Code>HeadObject</Code>, creates the{" "}
            <Code>PayrollSourceFile</Code> row, runs the malware scan
            (inline for the noop driver, queued for ClamAV / GuardDuty).
          </OLI>
          <OLI>
            <strong>Map columns + confirm totals + create run.</strong> The
            normalization engine produces line items, the validation engine
            fires 20+ rules, and the run lands in either <Code>validated</Code>{" "}
            or <Code>exception_review</Code> status.
          </OLI>
        </OL>
      </div>
      <div className="mt-6 space-y-4">
        <P>
          The column mapping step auto-suggests from canonical-field aliases —
          the headers in the sample CSV (<Code>Employee ID</Code>,{" "}
          <Code>SSN</Code>, <Code>Pay Date</Code>, <Code>Gross</Code>,{" "}
          <Code>401k</Code>, <Code>Roth</Code>, <Code>Match</Code>,{" "}
          <Code>Loan</Code>) all map automatically.
        </P>
        <P>
          The totals confirmation step is where the operator types the sums
          printed on the source file's header / summary row. Differences from
          the line-item sums create a blocking{" "}
          <Code>approval_readiness.totals_reconcile</Code> issue.
        </P>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §04 Payroll provider integrations                          */
/* ────────────────────────────────────────────────────────── */

function PayrollIntegrations() {
  return (
    <section>
      <H
        id="integrations"
        number="04"
        title="Payroll provider integrations"
        kicker="OAuth-based read-only sync"
      />
      <P>
        As an alternative to CSV upload, Nevatas can pull employees and
        payroll runs directly from a connected payroll provider. Phase 2
        ships Paycor as a deterministic mock adapter (no sandbox credentials
        required) plus a live-adapter scaffold ready for production wiring.
        ADP, Gusto, Paychex, iSolved, and QuickBooks Payroll are stubbed in
        the UI for Phase 3.
      </P>

      <div className="mt-6">
        <P>
          Connections live per company at{" "}
          <strong>/app/companies/&lt;id&gt;/connections</strong>. The page
          shows three groupings: active connections (with sync history),
          available providers (Connect button), and inactive connections
          (audit-trail of past disconnects).
        </P>
      </div>

      <h3 className="display text-[20px] font-medium text-ink mt-10 mb-4">
        Connect flow
      </h3>
      <div className="mt-3">
        <OL>
          <OLI>
            Click <strong>Connect</strong> on the Paycor card.{" "}
            <Code>POST /api/integrations/paycor/connect</Code> creates (or
            reuses) an inactive <Code>PayrollConnection</Code> row, signs a
            10-minute HMAC state token carrying the connection id, and 302s
            to the provider's authorize URL.
          </OLI>
          <OLI>
            With <Code>PAYCOR_DRIVER=mock</Code> (default in dev) the
            authorize URL points at our own{" "}
            <Code>/api/integrations/paycor/mock-authorize</Code> route, which
            immediately bounces back to the callback with a fabricated code.
            No external trip required.
          </OLI>
          <OLI>
            <Code>/api/integrations/paycor/callback</Code> verifies the
            state HMAC, refuses cross-session replay (callback session userId
            must equal state.userId), exchanges the code via{" "}
            <Code>adapter.connect()</Code>, and persists the access /
            refresh tokens via field-level{" "}
            <Code>AES-256-GCM</Code> envelope encryption.
          </OLI>
          <OLI>
            Browser lands back on the dashboard with{" "}
            <Code>?connected=paycor</Code>. The connection is now active.
          </OLI>
        </OL>
      </div>

      <h3 className="display text-[20px] font-medium text-ink mt-10 mb-4">
        Sync flow
      </h3>
      <P>
        Click <strong>Sync now</strong> on an active connection.{" "}
        <Code>POST /api/payroll-connections/&lt;id&gt;/sync</Code> enqueues
        a <Code>payroll.sync</Code> background job (idempotency-keyed; a
        repeat click within 5 minutes returns the existing job). The worker
        runs the orchestrator:
      </P>
      <div className="mt-3">
        <L>
          <LI>
            <Code>adapter.getCompany()</Code> →{" "}
            <Code>adapter.getEmployees()</Code> → upsert{" "}
            <Code>Participant</Code> rows by{" "}
            <Code>(companyId, externalEmployeeId)</Code>.
          </LI>
          <LI>
            <Code>adapter.getPayrollRuns(&#123; since &#125;)</Code> → for
            each new run, <Code>getPayrollRunDetails()</Code>, snapshot the
            payload as a synthetic JSON{" "}
            <Code>PayrollSourceFile</Code> + <Code>SourceRow</Code> set, run
            the validation engine, create a <Code>PayrollRun</Code> in{" "}
            <Code>validated</Code> or <Code>exception_review</Code>.
          </LI>
          <LI>
            Re-sync is safe: existing runs are matched by{" "}
            <Code>externalPayrollRunId</Code> and skipped.
          </LI>
        </L>
      </div>
      <P>
        The UI polls{" "}
        <Code>/api/payroll-connections/&lt;id&gt;/sync-status</Code> every
        1.5s for up to 30s and surfaces the verdict inline (
        <em>✓ Synced N employees · M new runs</em> or the failure message).
      </P>

      <h3 className="display text-[20px] font-medium text-ink mt-10 mb-4">
        Disconnect
      </h3>
      <P>
        <strong>Disconnect</strong> wipes the encrypted token blob, flips
        status to <Code>inactive</Code>, and writes an audit event. The row
        itself stays for audit trail; past <Code>SyncJob</Code> rows and
        every imported <Code>PayrollRun</Code> are preserved verbatim.
      </P>

      <h3 className="display text-[20px] font-medium text-ink mt-10 mb-4">
        Mock vs live driver
      </h3>
      <div className="mt-3">
        <L>
          <LI>
            <Code>PAYCOR_DRIVER=mock</Code> (default) — uses{" "}
            <Code>PaycorMockAdapter</Code>: 8 deterministic employees, 3
            biweekly runs, designed to exercise real validation rules
            (terminated-with-deferral, employer-match-mismatch, etc.). No
            credentials required. Hard-gated to{" "}
            <Code>NODE_ENV !== "production"</Code>.
          </LI>
          <LI>
            <Code>PAYCOR_DRIVER=live</Code> — uses{" "}
            <Code>PaycorLiveAdapter</Code>. Requires{" "}
            <Code>PAYCOR_CLIENT_ID</Code>, <Code>PAYCOR_CLIENT_SECRET</Code>,{" "}
            <Code>PAYCOR_API_BASE_URL</Code>,{" "}
            <Code>PAYCOR_AUTH_BASE_URL</Code>. The constructor throws on
            missing config; the connect route surfaces it as a 503.
          </LI>
        </L>
      </div>
      <Note tone="info">
        See <Code>src/lib/integrations/paycor/live-adapter.ts</Code> for the
        8-step wiring checklist. Swapping to live requires no changes
        outside that file.
      </Note>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §05 Approval                                               */
/* ────────────────────────────────────────────────────────── */

function Approval() {
  return (
    <section>
      <H
        id="approval"
        number="05"
        title="Sponsor approval"
        kicker="The signature that holds up"
      />
      <P>
        Sponsor approval is a first-class compliance artifact. Only roles
        with <Code>contribution.approve</Code> can sign, and the role
        requires MFA. The approval record captures the certification text
        verbatim, the approving user, IP, user agent, a hash of the
        contribution-row snapshot, and the exact contribution file's
        checksum.
      </P>
      <div className="mt-6">
        <P>To approve a generated contribution file:</P>
      </div>
      <div className="mt-3">
        <OL>
          <OLI>Sign in as a user with the Plan Sponsor Approver role.</OLI>
          <OLI>
            Confirm your account has MFA enabled (<strong>Security</strong>{" "}
            in the nav). If not, enroll first.
          </OLI>
          <OLI>
            Open the payroll run. Read the validation issues, the
            contributions list, and the file preview.
          </OLI>
          <OLI>
            Click <strong>Approve contribution file</strong>, read the
            certification text, click <strong>I certify and approve</strong>.
          </OLI>
        </OL>
      </div>
      <Note tone="warning">
        Any change to contributions or to the contribution file after
        approval automatically invalidates the approval. The operator must
        regenerate the file (which produces a new version) and the sponsor
        must re-approve.
      </Note>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §06 Corrections                                            */
/* ────────────────────────────────────────────────────────── */

function Corrections() {
  return (
    <section>
      <H id="corrections" number="06" title="Correction cycles" />
      <P>
        Once a payroll run is approved (or generated, submitted, accepted,
        or rejected), the source data is locked. To fix something — a
        miscoded employee, a missed deferral — you open a{" "}
        <strong>correction cycle</strong>: a tracked workflow that re-opens
        the run for re-validation and a new contribution file, while
        preserving the original artifacts verbatim.
      </P>
      <div className="mt-6">
        <OL>
          <OLI>
            On the run detail page, click <strong>Open correction cycle</strong>{" "}
            and provide a reason (≥ 10 characters, audited).
          </OLI>
          <OLI>
            The current sponsor approval is invalidated; the run flips back
            to <Code>exception_review</Code>; a{" "}
            <Code>CorrectionCycle</Code> row is created in <Code>open</Code>{" "}
            state.
          </OLI>
          <OLI>
            Resolve any new issues, regenerate the contribution file (it
            becomes v2, automatically tagged with the cycle id).
          </OLI>
          <OLI>
            The sponsor re-approves; the cycle auto-closes inside the same
            transaction.
          </OLI>
        </OL>
      </div>
      <P>
        Original v1 contribution file, original approval record, and every
        audit event are preserved. The audit-package ZIP includes both
        cycles.
      </P>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §07 Plan rules                                             */
/* ────────────────────────────────────────────────────────── */

function PlanRules() {
  return (
    <section>
      <H id="plan-rules" number="07" title="Plan rules" />
      <P>
        Plan rules are versioned by effective date and never mutated in
        place. When something changes — match formula, IRS limits for a new
        plan year, recordkeeper template — you create a new version with a
        future effective date. Prior payroll runs are never re-validated
        against new rules.
      </P>
      <div className="mt-6">
        <P>A rule version captures:</P>
      </div>
      <div className="mt-3">
        <L>
          <LI>
            <Code>planYear</Code>, <Code>irsElectiveDeferralLimit</Code>,{" "}
            <Code>irsCatchUpLimit50Plus</Code>,{" "}
            <Code>maxEmployeeDeferralPercent</Code>
          </LI>
          <LI>
            <Code>matchFormula</Code> — flat percent or tiered (e.g.,{" "}
            <em>100% on first 3% + 50% on next 2%</em>)
          </LI>
          <LI>
            <Code>safeHarborType</Code> — <Code>basic_match</Code>,{" "}
            <Code>enhanced_match</Code>, <Code>nonelective_3pct</Code>, or{" "}
            <Code>none</Code>
          </LI>
          <LI>
            <Code>timeliness</Code> — small-plan safe harbor (7 business
            days), general-rule (15-business-day backstop), or custom
          </LI>
          <LI>
            <Code>eligibility.minServiceMonths</Code>
          </LI>
          <LI>
            <Code>compensationDefinition.basis</Code> —{" "}
            <Code>gross</Code> or <Code>eligible_required</Code>
          </LI>
          <LI>
            <Code>outputFormat</Code> — recordkeeper template key (<Code>nevatas.v1</Code>,{" "}
            <Code>empower.v1</Code>, <Code>fidelity.v1</Code>, …)
          </LI>
          <LI>
            <Code>participantCount</Code> — used to validate small-plan
            safe-harbor eligibility (refused at ≥ 100 participants)
          </LI>
        </L>
      </div>
      <Note tone="warning">
        Effective dates may not be in the past. To amend historical runs,
        use the correction-cycle workflow rather than backdating a rule
        version.
      </Note>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §08 Roles                                                  */
/* ────────────────────────────────────────────────────────── */

function Roles() {
  const rows = [
    { role: "Platform Super Admin", scope: "Platform", key: "platform_super_admin", note: "All permissions including impersonation + system health" },
    { role: "Platform Support Admin", scope: "Platform", key: "platform_support_admin", note: "Read-only platform-wide visibility for triage" },
    { role: "Firm Admin", scope: "Org", key: "firm_admin", note: "Manages companies, plans, users, integrations, plan rules" },
    { role: "Firm Operations User", scope: "Org", key: "firm_operations_user", note: "Day-to-day cycle operator at a TPA / RIA" },
    { role: "Plan Sponsor Admin", scope: "Org", key: "plan_sponsor_admin", note: "Employer-side admin who approves contributions + manages users" },
    { role: "Plan Sponsor Approver", scope: "Org", key: "plan_sponsor_approver", note: "Authorized signer for sponsor certifications" },
    { role: "Payroll Admin", scope: "Org", key: "payroll_admin", note: "Uploads payroll files + manages mappings; cannot approve" },
    { role: "Read-Only Auditor", scope: "Org", key: "read_only_auditor", note: "External / internal auditor with read-only access" },
  ];
  return (
    <section>
      <H id="roles" number="08" title="Roles & permissions" />
      <P>
        Permissions are checked server-side on every API request. UI hiding
        is for ergonomics only — it never grants access. The full permission
        set is in <Code>src/lib/rbac/permissions.ts</Code>; the role
        definitions are in <Code>src/lib/rbac/roles.ts</Code>.
      </P>
      <div className="overflow-hidden border border-ink/15 rounded-sm bg-paper mt-6">
        <table className="w-full text-[13.5px]">
          <thead className="bg-ledger/50 border-b border-ink/10 text-left mono text-[10px] uppercase tracking-[0.16em] text-subtle">
            <tr>
              <th className="px-4 py-2.5 font-normal">Role</th>
              <th className="px-4 py-2.5 font-normal">Scope</th>
              <th className="px-4 py-2.5 font-normal">Key</th>
              <th className="px-4 py-2.5 font-normal">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.07]">
            {rows.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="px-4 py-3 text-ink whitespace-nowrap">
                  {r.role}
                </td>
                <td className="px-4 py-3 text-ink/70 whitespace-nowrap">
                  {r.scope}
                </td>
                <td className="px-4 py-3 mono text-[12px] text-ink/85 whitespace-nowrap">
                  {r.key}
                </td>
                <td className="px-4 py-3 text-ink/75 leading-relaxed">
                  {r.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §09 Validation rules                                       */
/* ────────────────────────────────────────────────────────── */

function ValidationRules() {
  const rules: { key: string; sev: string; cat: string; desc: string }[] = [
    { key: "data_quality.duplicate_employee_in_run", sev: "BLOCKING", cat: "duplicate_omission", desc: "Employee appears more than once in the same run." },
    { key: "data_quality.negative_compensation", sev: "BLOCKING", cat: "compensation", desc: "Gross compensation is negative." },
    { key: "data_quality.zero_comp_with_deferral", sev: "CRITICAL", cat: "compensation", desc: "$0 gross with non-zero deferral." },
    { key: "data_quality.csv_injection_risk", sev: "WARNING", cat: "data_quality", desc: "Cell starts with =, +, -, @, tab, or carriage return — Excel formula-injection vector." },
    { key: "contribution_limit.deferral_exceeds_plan_percent", sev: "CRITICAL", cat: "contribution_limit", desc: "Per-row deferral % exceeds plan cap." },
    { key: "contribution_limit.ytd_402g_elective_deferral", sev: "WARN/BLOCK", cat: "contribution_limit", desc: "YTD pre-tax + Roth exceeds §402(g) base; blocks past base + catch-up." },
    { key: "employer_match.formula_mismatch", sev: "WARNING", cat: "employer_match", desc: "Reported match differs from plan-formula recompute by > $0.01." },
    { key: "safe_harbor.match_formula_mismatch", sev: "WARNING", cat: "safe_harbor", desc: "Reported safe-harbor match disagrees with basic / enhanced formula." },
    { key: "safe_harbor.nonelective_amount_mismatch", sev: "WARNING", cat: "safe_harbor", desc: "Reported safe-harbor nonelective ≠ 3% of comp base." },
    { key: "eligibility.terminated_with_deferral", sev: "CRITICAL", cat: "eligibility", desc: "Terminated participant has non-zero deferral." },
    { key: "eligibility.terminated_employee_in_payroll", sev: "INFO", cat: "eligibility", desc: "Terminated participant appears (likely final pay or severance)." },
    { key: "eligibility.contributing_before_service_minimum", sev: "WARNING", cat: "eligibility", desc: "Deferral before plan minimum service requirement." },
    { key: "loan_repayment.no_active_schedule", sev: "WARNING", cat: "loan_repayment", desc: "Loan repayment with no active LoanSchedule." },
    { key: "loan_repayment.amount_mismatch", sev: "WARNING", cat: "loan_repayment", desc: "Reported amount differs from amortization expected." },
    { key: "compensation.eligible_exceeds_gross", sev: "BLOCKING", cat: "compensation", desc: "Eligible comp greater than gross — structurally impossible." },
    { key: "compensation.eligible_missing_when_required", sev: "WARNING", cat: "compensation", desc: "Plan requires eligible comp but row didn't provide it." },
    { key: "compensation.eligible_ratio_drift", sev: "WARNING", cat: "compensation", desc: "Eligible/gross ratio below plan minimum — possible exclusion-list change." },
    { key: "approval_readiness.totals_reconcile", sev: "BLOCKING", cat: "approval_readiness", desc: "Header totals must equal line-item sums within $0.01." },
    { key: "payroll_timeliness.late_deposit_risk", sev: "WARN/CRITICAL", cat: "payroll_timeliness", desc: "Elapsed business days exceed plan threshold. Frozen at fundedAt when funding has been recorded; otherwise measured to today." },
    { key: "payroll_timeliness.small_plan_safe_harbor_misapplied", sev: "WARNING", cat: "payroll_timeliness", desc: "Small-plan SH configured on a plan with ≥ 100 participants." },
    { key: "census_payroll.active_employee_missing_from_payroll", sev: "INFO", cat: "eligibility", desc: "Active participant missing from this run." },
  ];
  const SEV_TONE: Record<string, string> = {
    BLOCKING: "text-danger",
    CRITICAL: "text-danger",
    WARNING: "text-warning",
    INFO: "text-subtle",
    "WARN/BLOCK": "text-warning",
    "WARN/CRITICAL": "text-warning",
  };
  return (
    <section>
      <H
        id="validation-rules"
        number="09"
        title="Validation rules"
        kicker={`${rules.length} rules registered`}
      />
      <P>
        Each rule has a stable key, a severity, and an evidence payload
        (expected vs actual). Rules fire during run creation; the engine
        never silently mutates source data. Issues land in the exception
        queue with status <Code>open</Code> and can be resolved, waived
        (with reason), or acknowledged.
      </P>
      <div className="overflow-hidden border border-ink/15 rounded-sm bg-paper mt-6">
        <table className="w-full text-[13px]">
          <thead className="bg-ledger/50 border-b border-ink/10 text-left mono text-[10px] uppercase tracking-[0.16em] text-subtle">
            <tr>
              <th className="px-4 py-2.5 font-normal">Severity</th>
              <th className="px-4 py-2.5 font-normal">Rule key</th>
              <th className="px-4 py-2.5 font-normal">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.07]">
            {rules.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span
                    className={
                      "mono text-[10px] tracking-[0.14em] " +
                      (SEV_TONE[r.sev] ?? "text-ink")
                    }
                  >
                    {r.sev}
                  </span>
                </td>
                <td className="px-4 py-2.5 mono text-[12px] text-ink whitespace-nowrap">
                  {r.key}
                </td>
                <td className="px-4 py-2.5 text-ink/75 leading-relaxed">
                  {r.desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §10 Output formats                                         */
/* ────────────────────────────────────────────────────────── */

function OutputFormats() {
  return (
    <section>
      <H id="output-formats" number="10" title="Recordkeeper output" />
      <P>
        The contribution file's format is selected per plan via{" "}
        <Code>PlanRules.outputFormat</Code>. Three templates ship today:
      </P>
      <div className="mt-6">
        <L>
          <LI>
            <Code>nevatas.v1</Code> — canonical Nevatas CSV. ISO date,
            SSN-last-4, alphabetic column order. Default fallback.
          </LI>
          <LI>
            <Code>empower.v1</Code> — illustrative Empower-shaped CSV:
            CRLF, MM/DD/YYYY date, leading record-type column, trailing
            TOTAL row.
          </LI>
          <LI>
            <Code>fidelity.v1</Code> — illustrative Fidelity-shaped output:
            pipe-delimited, YYYYMMDD date, plan-number prefix per row.
          </LI>
        </L>
      </div>
      <P>
        Real recordkeeper specs vary by plan and require recordkeeper-issued
        documentation. New templates land as a single ~50-line file in{" "}
        <Code>src/lib/recordkeepers/templates/</Code> and register with the
        engine without touching call sites.
      </P>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §11 Members                                                */
/* ────────────────────────────────────────────────────────── */

function Members() {
  return (
    <section>
      <H id="members" number="11" title="Members & invitations" />
      <P>
        Members management lives at <strong>/app/users</strong>. Firm Admins
        and Plan Sponsor Admins can invite teammates by email + role; the
        recipient receives a single-use 7-day invite link.
      </P>
      <div className="mt-6">
        <P>Notes on the invite flow:</P>
      </div>
      <div className="mt-3">
        <L>
          <LI>
            Re-inviting an email that already has a live invitation
            supersedes the prior token (only the latest works).
          </LI>
          <LI>
            If the email already has a Nevatas user (e.g., from another
            org), accepting attaches the new membership to the existing
            account — no second password.
          </LI>
          <LI>
            Platform-admin roles cannot be granted via the invite flow.
            Those are out-of-band.
          </LI>
          <LI>
            Revoke a pending invitation from the row in the pending-invites
            table; the link stops working immediately.
          </LI>
        </L>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §12 Security / MFA                                         */
/* ────────────────────────────────────────────────────────── */

function Security() {
  return (
    <section>
      <H id="security" number="12" title="Account security & MFA" />
      <P>
        MFA is required for any role that can approve contributions, manage
        roles, override scan verdicts, or create API keys. Enroll at{" "}
        <strong>Security</strong> in the nav.
      </P>
      <div className="mt-6">
        <OL>
          <OLI>
            Click <strong>Enable MFA</strong>. The page shows an{" "}
            <Code>otpauth://</Code> URI and a manual-entry secret.
          </OLI>
          <OLI>
            Add the URI / secret to your authenticator (1Password, Authy,
            Google Authenticator, Apple Passwords).
          </OLI>
          <OLI>
            Enter the 6-digit code shown by your authenticator. The server
            verifies it.
          </OLI>
          <OLI>
            <strong>Save your recovery codes</strong>. Ten single-use codes
            are shown <em>once</em> — you'll need them if you lose your
            authenticator.
          </OLI>
        </OL>
      </div>
      <P>
        At login, type the 6-digit TOTP <em>or</em> a recovery code into the
        Authenticator code field. Recovery codes are single-use; consuming
        one is audited.
      </P>
      <P>
        To disable MFA: <strong>Security</strong> → <strong>Disable MFA</strong>{" "}
        → re-enter your password.
      </P>
      <P>
        <strong>Forgot your password?</strong> Click <em>Forgot?</em> on the
        sign-in form. The reset link arrives by email (or to the worker's
        stdout under the console driver) and is valid for 30 minutes,
        single-use.
      </P>
      <Note tone="warning">
        Failed login attempts are throttled. Five failures within 15 minutes
        on the same email triggers a 15-minute lockout. Twenty failures
        from the same IP triggers an IP-level rate limit. All attempts are
        recorded in the <Code>LoginAttempt</Code> table.
      </Note>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §13 Audit                                                  */
/* ────────────────────────────────────────────────────────── */

function AuditExports() {
  return (
    <section>
      <H id="audit" number="13" title="Audit logs & exports" />
      <P>
        Every state-changing operation writes an <Code>AuditEvent</Code>{" "}
        with the actor, timestamp, request ID, and (where applicable) hashes
        of the before / after state. The table is append-only at the
        database trigger layer — UPDATE / DELETE / TRUNCATE are rejected.
      </P>
      <div className="mt-6">
        <P>
          The audit-package ZIP is the artifact you hand to a plan auditor.
          Download it from any payroll run's detail page (button visible to
          anyone with <Code>audit.read</Code>). Contents:
        </P>
      </div>
      <div className="mt-3">
        <L>
          <LI>
            <Code>manifest.json</Code> — entry list with sha256 + timestamps + exporter id
          </LI>
          <LI>
            <Code>source/&lt;filename&gt;</Code> — the raw uploaded CSV, verbatim
          </LI>
          <LI>
            <Code>validation-issues.csv</Code> — every issue with severity, status, expected / actual, resolution notes, waiver reasons
          </LI>
          <LI>
            <Code>contributions.csv</Code> — normalized line items
          </LI>
          <LI>
            <Code>contribution-files/v&lt;N&gt;_&lt;format&gt;</Code> — every generated contribution file (latest first)
          </LI>
          <LI>
            <Code>approvals.json</Code>, <Code>correction-cycles.json</Code>, <Code>audit-events.json</Code>
          </LI>
        </L>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §14 Admin tools                                            */
/* ────────────────────────────────────────────────────────── */

function AdminTools() {
  return (
    <section>
      <H id="admin" number="14" title="Admin tools" kicker="Platform Super Admin only" />
      <P>
        Two operator pages live under <Code>/app/admin/</Code>, gated on the{" "}
        <Code>platform.impersonate</Code> permission (granted only to{" "}
        Platform Super Admin in the seed).
      </P>
      <div className="mt-6">
        <L>
          <LI>
            <strong>/app/admin/health</strong> — runtime status of every
            adapter (KMS driver, secrets driver, storage driver, email
            driver, malware scanner), worker queue depth, last-successful-job
            age, database connectivity, last audit event. Anything red
            blocks production launch.
          </LI>
          <LI>
            <strong>/app/admin/impersonate</strong> — assume another user's
            session for support / debugging. Time-boxed (1 hour). Sensitive
            permissions (approve, submit, role-management, scan-override,
            invite) are stripped during impersonation. Every action is
            dual-attributed in the audit log. Cannot impersonate other
            platform admins.
          </LI>
        </L>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §15 Troubleshooting                                        */
/* ────────────────────────────────────────────────────────── */

function Troubleshooting() {
  const items: { q: string; a: ReactNode }[] = [
    {
      q: "Sign in fails with 'Invalid credentials' but I'm sure the password is right",
      a: (
        <>
          Check the <Code>LoginAttempt</Code> table for the actual outcome:
          <Pre>{`docker exec nevatas-pg psql -U postgres -d nevatas \\
  -c 'SELECT "emailLower", outcome, reason, "createdAt" \\
      FROM "LoginAttempt" ORDER BY "createdAt" DESC LIMIT 5;'`}</Pre>
          The outcome will be one of <Code>bad_password</Code>,{" "}
          <Code>mfa_required</Code>, <Code>bad_mfa</Code>,{" "}
          <Code>locked</Code>, <Code>unknown_user</Code>, or{" "}
          <Code>throttled</Code>. If <Code>locked</Code>, you've hit the
          15-min lockout — wait, or clear via psql:
          <Pre>{`UPDATE "User" SET "failedLoginCount" = 0, "lockedUntil" = NULL
WHERE email = 'admin@demo.local';`}</Pre>
        </>
      ),
    },
    {
      q: "'Cross-origin request denied' when submitting forms",
      a: (
        <>
          The CSRF / server-action gate rejected the request because the{" "}
          <Code>Origin</Code> header didn't match the app's host. Common
          causes: accessing <Code>127.0.0.1:3000</Code> while{" "}
          <Code>APP_URL</Code> is <Code>localhost:3000</Code>, a tunnel
          (ngrok), or a different port. Add the host to{" "}
          <Code>experimental.serverActions.allowedOrigins</Code> in{" "}
          <Code>next.config.ts</Code>.
        </>
      ),
    },
    {
      q: "'Malware scan did not complete within 60 seconds'",
      a: (
        <>
          With a real scanner driver (ClamAV / GuardDuty), scans run as
          background jobs — you must run the worker process:
          <Pre>npm run worker</Pre>
          With the noop scanner (default in dev) the scan runs inline at
          upload-complete time, no worker required.
        </>
      ),
    },
    {
      q: "Blocking validation issue prevents approval",
      a: (
        <>
          Blocking issues must be either <strong>resolved</strong> (the
          underlying data was fixed in a corrected source file) or{" "}
          <strong>waived</strong> (with a documented reason). Click the
          appropriate action on the issue's row. Authorization required:{" "}
          <Code>exception.resolve</Code> or <Code>exception.waive</Code>.
        </>
      ),
    },
    {
      q: "MFA enrollment isn't accepting my code",
      a: (
        <>
          Most common cause is clock skew between your phone and the server.
          The TOTP verifier accepts ±1 step (60 s window). If it's been
          longer, request a new code from your authenticator. If it
          persists, check your phone's time-sync setting.
        </>
      ),
    },
    {
      q: "Lost my MFA device — how do I recover?",
      a: (
        <>
          Use one of the recovery codes you saved at enrollment time. Type
          it into the Authenticator code field at sign-in. Each code is
          single-use; consuming one is audited. If you have no recovery
          codes, ask a Platform Super Admin to disable MFA via
          impersonation, then re-enroll.
        </>
      ),
    },
    {
      q: "Prisma error: 'X column / table does not exist'",
      a: (
        <>
          The Prisma client doesn't match the schema. Stop the dev server
          (releases the engine DLL on Windows), then:
          <Pre>{`npx prisma migrate deploy
npx prisma generate
npm run dev`}</Pre>
        </>
      ),
    },
    {
      q: "Worker crashed / job stuck in 'running'",
      a: (
        <>
          The worker doesn't auto-recover stuck rows — only completes them.
          To re-queue a stuck job:
          <Pre>{`UPDATE "BackgroundJob"
SET status = 'queued', "startedAt" = NULL
WHERE status = 'running' AND id = '<job-id>';`}</Pre>
          Then ensure the worker is running.
        </>
      ),
    },
    {
      q: "Sync now times out / never completes",
      a: (
        <>
          The sync endpoint enqueues a <Code>payroll.sync</Code> background
          job; a separate process drains the queue. Without the worker
          running, the job sits in <Code>queued</Code> forever and the UI
          hits its 30-second timeout. Run the worker in a second terminal
          alongside the dev server:
          <Pre>npm run worker</Pre>
          Then click <strong>Sync now</strong> again.
        </>
      ),
    },
    {
      q: "Background job stuck queued — runAfter is in the past but worker won't claim",
      a: (
        <>
          Postgres column timezone bug. The <Code>BackgroundJob.runAfter</Code>{" "}
          column is <Code>timestamp without time zone</Code>; if the database
          session timezone isn't UTC, Prisma's UTC writes are read back as
          local time, putting freshly-enqueued jobs hours into the future.
          One-time fix:
          <Pre>{`-- Run once against your Postgres database
ALTER DATABASE nevatas SET TIMEZONE = 'UTC';
-- Then restart the dev server and worker so they reconnect.`}</Pre>
          The change applies to new connections only — currently-open
          sessions still see the old timezone.
        </>
      ),
    },
    {
      q: "404 on /api/integrations/<provider>/connect or /mock-authorize",
      a: (
        <>
          Two common causes:
          <span className="block mt-2"><strong>(1)</strong> The dev server
          isn't running on the port you're hitting. Some other Next.js app
          may have grabbed port 3000 — check the title in the 404 response
          to confirm. The Nevatas dev server's terminal logs the actual
          port. Either stop the other process or update <Code>APP_URL</Code>{" "}
          to match the port Nevatas is actually serving on (and restart so
          the OAuth state encodes the correct redirect_uri).</span>
          <span className="block mt-2"><strong>(2)</strong> Cached route
          manifest. After adding new routes under a dynamic segment, the
          dev server occasionally fails to discover them. Stop the dev
          server, delete <Code>.next/</Code>, and restart:
          <Pre>{`Remove-Item -Recurse -Force .next   # PowerShell
# or: rm -rf .next                  # bash
npm run dev`}</Pre></span>
        </>
      ),
    },
  ];
  return (
    <section>
      <H id="troubleshooting" number="15" title="Troubleshooting" />
      <ol className="space-y-7 mt-6">
        {items.map((it, i) => (
          <li key={i} className="border-l-2 border-ink/15 pl-5">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-subtle mb-2">
              {String(i + 1).padStart(2, "0")} · Issue
            </p>
            <h3 className="display text-[18px] sm:text-[20px] font-medium text-ink leading-tight mb-3">
              {it.q}
            </h3>
            <div className="text-[14px] leading-relaxed text-ink/80 space-y-3 max-w-[78ch]">
              {it.a}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* §16 Contact                                                */
/* ────────────────────────────────────────────────────────── */

function Contact() {
  const lines = [
    { k: "Demo / sales", v: "demo@nevatas.local" },
    { k: "General questions", v: "hello@nevatas.local" },
    { k: "Security disclosures", v: "security@nevatas.local" },
    { k: "Status / outages", v: "status.nevatas.local" },
  ];
  return (
    <section>
      <H id="contact" number="16" title="Get help" />
      <P>
        We answer in business hours, normally within a few hours. For
        production incidents, mark your subject line with{" "}
        <Code>[URGENT]</Code> and we'll route accordingly.
      </P>
      <div className="mt-6 border border-ink/15 rounded-sm bg-paper p-7">
        <dl className="space-y-3 text-[14px]">
          {lines.map((l) => (
            <div
              key={l.k}
              className="flex items-baseline justify-between gap-3 border-b border-ink/10 pb-3 last:border-0 last:pb-0"
            >
              <dt className="text-ink/75">{l.k}</dt>
              <dd className="mono text-[12.5px] text-ink">
                {l.v.includes("@") ? (
                  <a
                    href={`mailto:${l.v}`}
                    className="text-brand hover:underline underline-offset-4"
                  >
                    {l.v}
                  </a>
                ) : (
                  l.v
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] text-ink/70 hover:text-ink transition-colors"
        >
          ← Back to overview
        </Link>
      </div>
    </section>
  );
}
