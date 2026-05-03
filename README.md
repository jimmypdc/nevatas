# Nevatas

Compliance-grade payroll-to-401(k) operations platform. See `CLAUDE.md` for the
full product spec, security architecture, and ERISA / SOC 2 design principles.

This repo currently implements **Phase 1 (file-based MVP)**:
- Auth + organization / company / plan / participant model
- RBAC with seeded roles and permissions
- Secure CSV upload (hashed, immutable in object storage, with audit)
- Column mapping + raw-row preservation
- Normalization engine (CSV → canonical contribution records)
- Validation engine (data quality, contribution limits, employer-match formula,
  reconciliation, timeliness)
- Sponsor approval workflow with locked totals snapshot + certification
- Contribution file generation (`nevatas.v1` CSV format)
- Append-only audit log on every mutation (DB-trigger enforced)
- Argon2id password policy with HIBP k-anonymity check, account lockout, and login-attempt logging
- CSRF (origin verification) + per-IP rate limiting via Edge middleware
- TOTP MFA enrollment (RFC 6238) with single-use recovery codes; required for sponsor approval, role management, and API key creation
- Approval invalidation: any mutation to contributions or contribution files after sponsor approval automatically invalidates the approval record
- Stripe-style request idempotency: mutating endpoints accept `Idempotency-Key` header; replays the stored response on retry, rejects same-key + different-body as 422, in-flight retries as 409
- Pluggable email provider (console/Resend/SES) with templated transactional sends and a queryable EmailMessage log
- Self-service password reset (single-use tokens, hashed in DB, 30-min TTL, reuses the password policy)
- User invite + accept flow (single-use tokens, 7-day TTL, supersedes prior live invites; auto-attaches a new membership when the email already has a Nevatas user)
- Per-recordkeeper output templates (nevatas.v1 default; illustrative empower.v1 and fidelity.v1; new templates land as a single ~50-line file)
- File preview before approval (shows first/last lines of the generated file in the run detail page)
- Audit-package ZIP export — single download with source CSV, validation issues, contribution files, approvals, correction cycles, and audit events; manifest-with-checksums included

## Prerequisites

- Node.js 22+
- PostgreSQL 14+ (local Docker is fine)

## Setup

```bash
# 1. install deps
npm install

# 2. start postgres (one option)
docker run --name nevatas-pg -e POSTGRES_PASSWORD=nevatas -p 5432:5432 -d postgres:16

# 3. configure env
cp .env.example .env
# Generate FIELD_ENCRYPTION_KEY and AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # FIELD_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # AUTH_SECRET

# 4. migrate + seed
npm run prisma:migrate -- --name init
npm run db:seed

# 5. run (two terminals)
npm run dev      # Next.js app
npm run worker   # background job runner (drains the BackgroundJob queue)
```

Open http://localhost:3000 and sign in:

- `admin@demo.local` / `nevatas-admin-2026!` — Firm Admin (uploads, validates, generates)
- `approver@demo.local` / `nevatas-approver-2026!` — Plan Sponsor Approver (approves contribution files)
- `platform@demo.local` / `nevatas-platform-2026!` — Platform Super Admin (impersonation, system health)

## Demo workflow

The seed script creates two demo companies (Acme Industries, Beta Manufacturing), six Acme participants (one terminated, one hired post-payroll-date), and one active loan schedule. Walk the canonical end-to-end as the Firm Admin:

1. **Upload** — go to **Upload** in the nav, pick `examples/contributions-sample.csv`. The browser hashes the file with Web Crypto and PUTs directly to storage; the server confirms via `headObject`.
2. **Map columns** — auto-fills from the canonical-field aliases. Click Continue.
3. **Confirm totals** — pre-filled with the line-item sums; this becomes the value the totals-reconciliation validator checks against the source file's reported totals.
4. **Create payroll run** — the validation engine fires 20+ rules. The sample data deliberately produces:
   - `eligibility.terminated_with_deferral` (critical) — E006 was terminated 2026-03-31 but reports a deferral on the 4/15 payroll
   - `data_quality.zero_comp_with_deferral` (critical) — E005 has $0 gross + $100 deferral
   - `loan_repayment.amount_mismatch` warnings if the seeded amount drifts from the source file
   - `payroll_timeliness.late_deposit_risk` once enough business days pass
5. **Resolve / waive** the issues that aren't blocking, **generate the contribution file** (Empower-style for Acme, Fidelity-style for Beta), preview the first/last lines.
6. **Sign out** as admin, sign in as `approver@demo.local`. Open the run, **approve** with the certification text. (Approval requires MFA in production; the seed user has it disabled for demo simplicity.)
7. Sign back in as the admin and **download the audit-package ZIP** — single archive with source CSV, validation issues, contribution files, approvals, correction cycles, audit events, and a sha256 manifest.
8. To exercise the **correction-cycle workflow**: open the approved run, click **Open correction cycle**, supply a reason. The approval is invalidated; the operator regenerates the file, the sponsor re-approves, and the cycle auto-closes.

Other paths to try:

- **/app/admin/health** as the platform user — runtime status panel for KMS, secrets, storage, email, scanner, worker queue, and database connectivity. Anything red blocks production launch.
- **/app/admin/impersonate** — start a 1-hour impersonation session as the platform admin. Sensitive permissions (approve, submit, role management, scan-override) are stripped during impersonation; every action is dual-attributed in the audit log.
- **Forgot password** at `/forgot-password` — the email link prints to the worker's stdout under the console driver.
- **Plan rules** at `/app/plans/<id>/rules` — create a future-effective rule version with a new match formula or output template.

## Demo flow

1. Upload `examples/contributions-sample.csv` for the Acme Industries plan
2. Confirm the suggested column mapping (it should auto-fill from header aliases)
3. Create the payroll run — the validation engine will fire (E005 has $0
   gross with a $100 deferral → critical issue)
4. Sign in as the approver to certify and approve
5. Download the generated contribution file

## Tests

```bash
npm test                 # unit tests, one-shot
npm run test:watch       # watch mode
npm run typecheck        # tsc --noEmit

# DB-backed integration tests (require a running Postgres + applied migrations)
RUN_DB_INTEGRATION_TESTS=1 npm test
```

The integration suite includes a tenant-isolation fuzz test
([src/test/tenant-isolation.integration.test.ts](src/test/tenant-isolation.integration.test.ts))
that bootstraps two parallel orgs and verifies every protected endpoint
returns 404 when called with a cross-tenant resource id.

## Project layout

```
src/
  app/                 # Next.js App Router (routes, layouts, API endpoints)
  lib/
    auth.ts            # NextAuth v5 config
    db.ts              # Prisma client singleton
    env.ts             # Zod-validated env loader
    audit.ts           # Append-only audit-event writer
    api-handler.ts     # Common API route helper (auth + Zod + safe errors)
    request-context.ts # Request ID / IP / user-agent capture
    session.ts         # requireActor() — auth + active-org resolution
    crypto/            # AES-256-GCM field encryption, Argon2id, sha256
    rbac/              # Permission constants, role definitions, check helpers
    storage/           # Driver interface + local-FS dev driver + key conventions
    normalization/     # CSV parsing, canonical fields, normalization engine
    validation/        # Validation engine and rule registry
    services/          # Use-case services (upload, parse, run, approve, …)
prisma/
  schema.prisma        # Data model (see CLAUDE.md §10)
  seed.ts              # Roles, permissions, demo org/users/plan/rules
examples/
  contributions-sample.csv
```

## What's intentionally NOT in this phase

- Direct payroll API integrations (Paycor/ADP/Gusto/Paychex/iSolved/QuickBooks) —
  Phase 2 onward
- Bi-directional write-back — Phase 4
- Background job runner (Trigger.dev / Inngest) — currently inline; Phase 5
- S3/R2 driver — `STORAGE_DRIVER=local` only; the interface is in place
- DB-trigger enforcement of audit-log immutability — interface enforced in
  application code; DB-level lock-down is a Phase 5 hardening item
- Per-recordkeeper output templates — Phase 2

## Compliance posture (Phase 1)

- TLS, CSRF, secure headers, no powered-by leak (`next.config.ts`)
- Zod validation on every API mutation
- Server-side permission checks on every API route (`requirePermission`)
- AES-256-GCM application-level encryption for SSN / EIN / DOB / tokens
- Argon2id password hashing (memoryCost 19 MiB, timeCost 2)
- Append-only audit events written in the same DB transaction as the mutation
- Immutable raw source rows preserved verbatim in `SourceRow`
- Sponsor approval captures totals snapshot, file checksum, IP, UA, certification
- Plan rules versioned by effective date (never mutated in place)
- Audit log: do not write SSNs, payroll payloads, or OAuth tokens (lib/audit.ts)
