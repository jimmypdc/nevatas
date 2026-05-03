# CLAUDE.md

# Nevatas — Compliance-Grade Universal Payroll-to-401(k) Operating System

## 1. Product Overview

Nevatas is a secure, compliance-first middleware platform that connects payroll systems to 401(k) recordkeeping, TPA, advisory, and plan administration workflows.

The platform is designed to support:

- Payroll-to-401(k) contribution processing
- Employee census synchronization
- Deferral election updates
- Loan repayment tracking
- Eligibility and entry-date monitoring
- Contribution validation
- Sponsor review and approval workflows
- Audit-ready reporting
- Secure API, CSV, and SFTP integrations
- SOC 2-ready security controls
- ERISA-safe operational workflows

Nevatas should not be treated as a simple payroll connector. It should be designed as a fiduciary-adjacent financial data platform that handles sensitive participant, compensation, payroll, and retirement plan data.

---

## 2. Core Product Vision

Build the operating system for retirement plan administration:

> Connect any payroll system to any 401(k) recordkeeper, validate the data, detect compliance risks, require sponsor approval, and preserve a complete audit trail.

The platform should prioritize:

1. Accuracy
2. Auditability
3. Security
4. Processing integrity
5. Sponsor control
6. Compliance support
7. Scalable integrations

Guiding principle:

> Accuracy over automation.

Automation should never override compliance safeguards, sponsor approval, or auditability.

---

## 3. Compliance Philosophy

Nevatas does not need to be “ERISA certified,” because ERISA does not certify software platforms. However, Nevatas must be designed to support ERISA-safe operations.

Nevatas may not legally require SOC 2 certification during MVP, but it should be built as SOC 2-ready from day one because employers, payroll companies, TPAs, RIAs, recordkeepers, and enterprise clients will expect strong security controls.

### Compliance Design Goals

The system must be able to prove:

- Who accessed data
- Who changed data
- What data changed
- When it changed
- Why it changed
- What source file/API produced the data
- Whether contribution totals reconciled
- Whether sponsor approval occurred
- Whether deposits appear timely
- Whether exceptions were reviewed
- Whether outputs were generated from validated data

---

## 4. ERISA-Safe Operating Principles

The platform must support plan sponsors and service providers in meeting retirement plan operational duties.

### ERISA-sensitive workflows include:

- Employee eligibility
- Deferral elections
- Employer match calculations
- Safe harbor contributions
- Profit-sharing allocations
- Loan repayments
- Timely contribution deposits
- Payroll remittance accuracy
- Participant-level source accounting
- Correction support and audit trails

### System Rules

1. Never silently alter payroll, census, deferral, loan, or contribution data.
2. Never overwrite source data without versioning.
3. Never submit contribution files without sponsor approval unless the client has explicitly enabled a controlled auto-approval workflow.
4. Never delete audit records.
5. Every payroll cycle must be reproducible.
6. Every generated file must be linked to the source data, validation results, approval record, and user who generated it.
7. Late contribution risk must be visible.
8. Exceptions must be categorized, tracked, and resolved or acknowledged.
9. Plan rules must be versioned by effective date.
10. Recordkeeping outputs must be locked after approval unless a correction cycle is opened.

---

## 5. SOC 2 Readiness Principles

Design toward SOC 2 Type I and Type II readiness.

### Trust Services Criteria Focus

Primary:

- Security
- Confidentiality
- Processing Integrity

Secondary:

- Availability
- Privacy, if participant-facing features are added

### Required Controls

- Role-based access control
- Multi-factor authentication support
- Encryption in transit
- Encryption at rest
- Secrets management
- Immutable audit logging
- Secure software development lifecycle
- Change management
- Incident response process
- Vendor risk tracking
- Data retention policy
- Backup and disaster recovery procedures
- System monitoring and alerting
- Access reviews
- Production access restrictions
- Logging of privileged actions
- API rate limiting
- Input validation
- Data import validation
- Secure file handling

---

## 6. Recommended Tech Stack

### Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- ShadCN UI
- React Hook Form
- Zod validation

### Backend

- Next.js API routes or dedicated Node.js service
- TypeScript
- PostgreSQL
- Prisma ORM
- Background jobs with Trigger.dev, Inngest, or BullMQ

### Auth

- NextAuth/Auth.js
- MFA-ready authentication
- Organization-based access
- RBAC and permission checks on every protected route

### Storage

- AWS S3 or Cloudflare R2
- Server-side encryption
- Object versioning
- Private buckets only
- Signed URLs with short expiration

### Infrastructure

Preferred production target:

- AWS
- RDS PostgreSQL
- KMS
- Secrets Manager
- CloudTrail
- CloudWatch
- S3
- WAF
- GuardDuty
- VPC isolation where appropriate

Alternative acceptable MVP target:

- Vercel for frontend/app
- Supabase or Neon Postgres
- Cloudflare R2
- Trigger.dev/Inngest for background jobs
- Akeyless, Doppler, AWS Secrets Manager, or similar secrets manager

---

## 7. High-Level System Architecture

```txt
Payroll Providers
  Paycor
  ADP
  Gusto
  Paychex
  iSolved
  QuickBooks Payroll
  CSV/SFTP

        ↓

Integration Adapter Layer

        ↓

Normalization Engine

        ↓

Validation & Compliance Engine

        ↓

Exception Management

        ↓

Sponsor Review & Approval

        ↓

Contribution Output Engine

        ↓

Recordkeeper / Custodian / TPA Workflow

        ↓

Audit Archive & Reporting
```

---

## 8. Core Application Modules

### 8.1 Organization & Plan Management

Manage:

- Employers
- Plans
- Plan years
- Plan rules
- Payroll schedules
- Recordkeeper mappings
- Contribution sources
- Eligibility rules
- Match formulas
- Safe harbor provisions
- Loan settings
- Approval requirements

Plan rules must be effective-date versioned.

Do not mutate prior plan rules after payroll cycles have been processed. Create a new rule version instead.

---

### 8.2 Payroll Integration Layer

Each payroll provider must be implemented through an adapter.

Folder structure:

```txt
/src/integrations
  /paycor
  /adp
  /gusto
  /paychex
  /isolved
  /quickbooks
  /csv
  /sftp
```

Provider interface:

```ts
export interface PayrollProviderAdapter {
  provider: PayrollProviderName

  connect(params: ConnectParams): Promise<ConnectionResult>

  refreshToken?(connectionId: string): Promise<TokenRefreshResult>

  getCompany(connectionId: string): Promise<ProviderCompany>

  getEmployees(connectionId: string, params?: SyncParams): Promise<ProviderEmployee[]>

  getPayrollRuns(connectionId: string, params?: SyncParams): Promise<ProviderPayrollRun[]>

  getPayrollRunDetails(connectionId: string, payrollRunId: string): Promise<ProviderPayrollRunDetail>

  getDeductions?(connectionId: string): Promise<ProviderDeduction[]>

  updateDeferralElection?(
    connectionId: string,
    input: ProviderDeferralUpdate
  ): Promise<ProviderWritebackResult>

  updateLoanRepayment?(
    connectionId: string,
    input: ProviderLoanUpdate
  ): Promise<ProviderWritebackResult>
}
```

Rules:

- Never store payroll provider passwords.
- Use OAuth when available.
- Encrypt access tokens and refresh tokens.
- Log API calls without storing sensitive payloads in plain text.
- Implement retry with exponential backoff.
- Never duplicate side-effect write-back calls without idempotency keys.

---

### 8.3 CSV and SFTP Fallback

CSV/SFTP support is required for MVP.

CSV import must include:

- Secure upload
- Virus/malware scanning where available
- Column mapping templates
- Header validation
- Duplicate detection
- Required field validation
- Data type validation
- Totals reconciliation
- File checksum generation
- File versioning
- Locked source-file snapshot

Supported import types:

- Census file
- Payroll contribution file
- Deferral election file
- Loan repayment file
- Payroll register
- Eligibility file

---

### 8.4 Normalization Engine

Provider-specific data must be mapped into Nevatas normalized objects.

Example normalized contribution object:

```ts
export type NormalizedContribution = {
  companyId: string
  planId: string
  participantId?: string
  externalEmployeeId?: string
  payrollRunId: string
  payrollDate: string
  payPeriodStartDate?: string
  payPeriodEndDate?: string
  grossCompensation: number
  eligibleCompensation?: number
  preTaxDeferral: number
  rothDeferral: number
  afterTaxContribution?: number
  employerMatch: number
  safeHarborMatch?: number
  safeHarborNonelective?: number
  profitSharing?: number
  loanRepayment: number
  sourceSystem: string
  sourceRecordId?: string
}
```

Rules:

- Store raw source data separately.
- Store normalized data separately.
- Link normalized records back to source records.
- Never destroy raw source data.
- Track transformation version.

---

### 8.5 Validation & Compliance Engine

The validation engine checks payroll and contribution data against plan rules, IRS limits, and operational requirements.

Validation categories:

1. Data quality
2. Employee identity matching
3. Eligibility
4. Contribution limits
5. Compensation
6. Loan repayments
7. Employer match
8. Safe harbor
9. Payroll timeliness
10. Recordkeeper formatting
11. Duplicate/omission detection
12. Sponsor approval readiness

Example validations:

- Missing SSN or participant identifier
- Duplicate employee
- Employee exists in payroll but not recordkeeping system
- Employee exists in recordkeeping system but not payroll
- Terminated employee has active deferrals
- Rehired employee eligibility not reviewed
- Eligible employee missing from contribution file
- Pre-tax and Roth totals exceed plan or IRS limits
- Deferral percentage exceeds plan limit
- Loan repayment missing
- Loan repayment differs from amortization schedule
- Compensation is zero but deferral exists
- Negative compensation
- Match formula mismatch
- Safe harbor formula mismatch
- Payroll date missing
- Payroll file submitted late
- Deposit not recorded within expected window
- Contribution totals do not match payroll totals

Validation output:

```ts
export type ValidationIssue = {
  id: string
  severity: "info" | "warning" | "critical" | "blocking"
  category: string
  entityType: string
  entityId?: string
  participantId?: string
  message: string
  recommendedResolution?: string
  sourceField?: string
  expectedValue?: string | number
  actualValue?: string | number
  status: "open" | "acknowledged" | "resolved" | "waived"
}
```

Blocking issues should prevent contribution file approval unless specifically overridden by an authorized user with a required reason.

---

### 8.6 Contribution Engine

The contribution engine creates output files for recordkeepers, custodians, or TPA workflows.

Requirements:

- Source-level breakdown
- Recordkeeper-specific templates
- Export versioning
- File checksum
- File preview
- Sponsor approval record
- Generation logs
- Reproducibility from locked source data
- Support for corrections and reversal files

Contribution file lifecycle:

```txt
Draft
Validated
Exception Review
Sponsor Approved
Generated
Submitted
Accepted
Rejected
Corrected
Archived
```

---

### 8.7 Sponsor Review and Approval Workflow

Sponsor approval is a core compliance control.

Approval record must include:

- Company
- Plan
- Payroll run
- File version
- Validation summary
- Exceptions acknowledged
- Approving user
- Timestamp
- IP address
- User agent
- Approval certification text
- Locked file snapshot
- Hash/checksum of approved output

Example approval certification:

> I certify that I have reviewed the payroll contribution data, exception report, and contribution totals for this payroll cycle and approve the generation or submission of the contribution file.

Approval rules:

- Only authorized sponsor users may approve.
- Internal admin approval should not replace sponsor approval unless documented in the client service agreement.
- Approval cannot be edited after submission.
- If contribution data changes after approval, approval is invalidated and a new approval is required.

---

### 8.8 Exception Management

Exception system must allow:

- Assignment
- Comments
- Status changes
- Evidence uploads
- Waiver with reason
- Resolution history
- Severity escalation
- Filtering by payroll run, participant, category, and severity

Exception statuses:

- Open
- In Review
- Awaiting Sponsor
- Awaiting Payroll Provider
- Resolved
- Acknowledged
- Waived

All status changes must create audit events.

---

### 8.9 Audit Logging Engine

Audit logging is mandatory.

Audit logs must be append-only.

Never update or delete audit records through normal application code.

Audit event model:

```ts
export type AuditEvent = {
  id: string
  organizationId: string
  companyId?: string
  planId?: string
  actorUserId?: string
  actorType: "user" | "system" | "api" | "job"
  action: string
  entityType: string
  entityId?: string
  beforeHash?: string
  afterHash?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  requestId?: string
  createdAt: string
}
```

Important audit events:

- Login
- Failed login
- MFA challenge
- Password reset
- Role changed
- User invited
- User removed
- Payroll connection created
- Payroll token refreshed
- Payroll sync started
- Payroll sync completed
- Payroll sync failed
- File uploaded
- File parsed
- Mapping changed
- Plan rule changed
- Validation run completed
- Exception created
- Exception resolved
- Exception waived
- Contribution file generated
- Sponsor approval recorded
- File submitted
- Write-back performed
- Data exported
- Admin impersonation started/stopped

---

### 8.10 Timeliness Tracking

Track dates relevant to contribution deposit timing.

Data fields:

- Payroll date
- Pay period start
- Pay period end
- Payroll processed date
- Contribution file generated date
- Sponsor approval date
- Submission date
- Funding date
- Custodian acceptance date

The system should calculate elapsed days and flag late-risk payroll cycles.

Important:

Nevatas should not provide legal advice or automatically determine ERISA violations. It should flag operational risk and provide audit support.

---

### 8.11 Bi-Directional Sync

Bi-directional sync should be added only after read-only integrations and contribution processing are stable.

Write-back examples:

- Deferral election changes
- Roth election changes
- Loan repayment changes
- Eligibility indicator updates

Write-back controls:

- Idempotency keys
- Pre-submit validation
- User approval
- Provider response logging
- Rollback/correction workflow
- Confirmation receipt
- Error handling
- Retry limits
- No duplicate writebacks

---

### 8.12 AI Assistance Layer

AI may assist users but must not autonomously approve, submit, or alter financial records.

Allowed AI use cases:

- Explain exceptions
- Suggest possible fixes
- Draft sponsor emails
- Summarize payroll sync results
- Identify anomaly patterns
- Generate internal notes
- Create plan sponsor reminders
- Help map CSV columns

Restricted AI use cases:

- No automatic approval
- No unsupervised deferral changes
- No unsupervised contribution corrections
- No legal determinations
- No fiduciary advice
- No investment advice unless separately authorized and supervised

AI outputs must be labeled as assistance, not determinations.

---

## 9. Security Architecture

### 9.1 Authentication

Requirements:

- Email/password or SSO support
- MFA-ready
- Secure password hashing
- Account lockout or throttling
- Session timeout
- Device/session management
- Secure password reset flow

Preferred future features:

- SAML/SSO for enterprise clients
- SCIM provisioning
- Enforced MFA by organization

---

### 9.2 Authorization

Implement RBAC with permission-level enforcement.

Roles:

```txt
Platform Super Admin
Platform Support Admin
Firm Admin
Firm Operations User
Plan Sponsor Admin
Plan Sponsor Approver
Payroll Admin
Read-Only Auditor
Participant
API Client
```

Permissions should be explicit.

Examples:

```txt
company.read
company.update
plan.read
plan.update
payroll_connection.create
payroll_connection.read
payroll_sync.run
payroll_file.upload
payroll_file.map
validation.run
exception.resolve
exception.waive
contribution.generate
contribution.approve
contribution.submit
audit.read
user.invite
role.manage
api_key.create
```

Rules:

- Check permissions server-side on every API request.
- Never rely on UI hiding.
- Scope users to organizations, companies, and plans.
- Log permission changes.
- Restrict platform super admin access.
- Support emergency access logging.

---

### 9.3 Encryption

Required:

- TLS 1.2+ in transit
- Database encryption at rest
- Object storage encryption at rest
- Application-level encryption for highly sensitive fields

Sensitive fields:

- SSN
- EIN
- DOB
- Payroll provider tokens
- Bank/funding data
- Compensation details
- Participant identifiers

Use a managed key service:

- AWS KMS
- GCP KMS
- Azure Key Vault
- HashiCorp Vault

Never commit secrets to source control.

---

### 9.4 Secrets Management

Use a secrets manager in production.

Do not store production secrets in:

- GitHub
- Plain `.env` files
- Application logs
- Client-side code
- Unencrypted databases

Secrets rotation should be supported.

---

### 9.5 Secure File Handling

Files may contain SSNs, compensation, payroll data, and contribution data.

Requirements:

- Private storage only
- Signed URLs only
- Short-lived access links
- Object versioning
- File checksum
- Malware scanning where supported
- File type validation
- Size limits
- Upload audit logs
- Download audit logs
- No public buckets
- No permanent public links

---

### 9.6 Logging Rules

Do log:

- Request ID
- User ID
- Organization ID
- Action
- Entity type
- Status
- Timing
- Error code

Do not log:

- SSNs
- Full payroll files
- OAuth tokens
- Passwords
- Full compensation payloads
- Bank account numbers
- Raw sensitive API responses

Use structured logs.

---

### 9.7 API Security

Requirements:

- Server-side auth checks
- Rate limiting
- Zod validation
- CSRF protection where applicable
- CORS locked down
- Idempotency keys for mutation endpoints
- Request IDs
- Input sanitization
- Pagination on list endpoints
- Field-level access filtering
- No sensitive data in query strings

---

## 10. Data Model

Use PostgreSQL with Prisma.

Suggested core models:

```prisma
model Organization {
  id          String   @id @default(cuid())
  name        String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users       OrganizationUser[]
  companies   Company[]
}

model OrganizationUser {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  roleId         String
  status         String   @default("active")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(fields: [organizationId], references: [id])
  user           User         @relation(fields: [userId], references: [id])
  role           Role         @relation(fields: [roleId], references: [id])
}

model User {
  id             String   @id @default(cuid())
  email          String   @unique
  name           String?
  emailVerified  DateTime?
  mfaEnabled     Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organizations  OrganizationUser[]
}

model Role {
  id          String   @id @default(cuid())
  name        String
  description String?
  permissions RolePermission[]
}

model Permission {
  id          String   @id @default(cuid())
  key         String   @unique
  description String?
  roles       RolePermission[]
}

model RolePermission {
  id           String @id @default(cuid())
  roleId       String
  permissionId String

  role         Role       @relation(fields: [roleId], references: [id])
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@unique([roleId, permissionId])
}

model Company {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  einEncrypted   String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(fields: [organizationId], references: [id])
  plans          Plan[]
}

model Plan {
  id          String   @id @default(cuid())
  companyId   String
  name        String
  planNumber  String?
  recordkeeper String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  company     Company @relation(fields: [companyId], references: [id])
  ruleVersions PlanRuleVersion[]
  payrollRuns PayrollRun[]
}

model PlanRuleVersion {
  id          String   @id @default(cuid())
  planId      String
  effectiveDate DateTime
  rulesJson   Json
  createdById String?
  createdAt   DateTime @default(now())

  plan        Plan @relation(fields: [planId], references: [id])
}

model Participant {
  id              String   @id @default(cuid())
  companyId       String
  externalEmployeeId String?
  ssnEncrypted    String?
  ssnLast4        String?
  firstName       String
  lastName        String
  dateOfBirthEncrypted String?
  status          String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model PayrollConnection {
  id              String   @id @default(cuid())
  companyId       String
  provider        String
  status          String
  encryptedTokens Json?
  settingsJson    Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model PayrollRun {
  id                String   @id @default(cuid())
  planId            String
  payrollDate       DateTime
  payPeriodStart    DateTime?
  payPeriodEnd      DateTime?
  status            String
  sourceSystem      String
  sourceFileId      String?
  totalGrossComp    Decimal? @db.Decimal(18, 2)
  totalContributions Decimal? @db.Decimal(18, 2)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  plan              Plan @relation(fields: [planId], references: [id])
}

model PayrollSourceFile {
  id              String   @id @default(cuid())
  companyId       String
  fileName        String
  storageKey      String
  checksum        String
  mimeType        String
  sizeBytes       Int
  uploadedById    String?
  createdAt       DateTime @default(now())
}

model PayrollContribution {
  id              String   @id @default(cuid())
  payrollRunId    String
  participantId   String?
  sourceRecordId  String?
  grossCompensation Decimal @db.Decimal(18, 2)
  preTaxDeferral    Decimal @db.Decimal(18, 2)
  rothDeferral      Decimal @db.Decimal(18, 2)
  employerMatch     Decimal @db.Decimal(18, 2)
  loanRepayment     Decimal @db.Decimal(18, 2)
  rawJson           Json?
  normalizedJson    Json?
  createdAt         DateTime @default(now())
}

model SyncJob {
  id              String   @id @default(cuid())
  companyId       String
  planId          String?
  provider        String
  status          String
  startedAt       DateTime?
  completedAt     DateTime?
  errorCode       String?
  errorMessage    String?
  metadataJson    Json?
  createdAt       DateTime @default(now())
}

model ValidationIssue {
  id              String   @id @default(cuid())
  payrollRunId    String
  severity        String
  category        String
  entityType      String
  entityId        String?
  participantId   String?
  message         String
  expectedValue   String?
  actualValue     String?
  status          String   @default("open")
  resolutionNote  String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model ContributionFile {
  id              String   @id @default(cuid())
  payrollRunId    String
  version         Int
  status          String
  storageKey      String
  checksum        String
  generatedById   String?
  approvedById    String?
  approvedAt      DateTime?
  submittedAt     DateTime?
  createdAt       DateTime @default(now())
}

model AuditEvent {
  id              String   @id @default(cuid())
  organizationId  String
  companyId       String?
  planId          String?
  actorUserId     String?
  actorType       String
  action          String
  entityType      String
  entityId        String?
  beforeHash      String?
  afterHash       String?
  metadataJson    Json?
  ipAddress       String?
  userAgent       String?
  requestId       String?
  createdAt       DateTime @default(now())

  @@index([organizationId, createdAt])
  @@index([companyId, createdAt])
  @@index([entityType, entityId])
}
```

---

## 11. API Design

All APIs must:

- Authenticate user
- Authorize permission
- Validate input with Zod
- Log audit events for mutations
- Use request IDs
- Return safe errors
- Never leak sensitive fields

Suggested API routes:

```txt
POST   /api/auth/*
GET    /api/me

GET    /api/organizations/:id
GET    /api/companies
POST   /api/companies
GET    /api/plans/:id
POST   /api/plans/:id/rules

POST   /api/integrations/:provider/connect
POST   /api/integrations/:provider/callback
POST   /api/integrations/:provider/sync
GET    /api/integrations/:provider/status

POST   /api/files/upload
POST   /api/files/:id/map
POST   /api/files/:id/parse

POST   /api/payroll-runs
GET    /api/payroll-runs/:id
POST   /api/payroll-runs/:id/validate
GET    /api/payroll-runs/:id/exceptions

POST   /api/exceptions/:id/resolve
POST   /api/exceptions/:id/waive

POST   /api/contribution-files/generate
GET    /api/contribution-files/:id
POST   /api/contribution-files/:id/approve
POST   /api/contribution-files/:id/submit

GET    /api/audit-events
GET    /api/reports/payroll-cycle/:id
```

---

## 12. User Interface Requirements

### Main Dashboard

Show:

- Recent payroll syncs
- Pending approvals
- Critical exceptions
- Late-risk payroll cycles
- Failed integrations
- Plans requiring attention

### Company Dashboard

Show:

- Connected payroll provider
- Active plans
- Payroll schedule
- Recent files
- Recent approvals
- Open issues

### Payroll Run Page

Show:

- Payroll dates
- Source data
- Contribution totals
- Validation summary
- Exceptions
- Reconciliation status
- Approval status
- Contribution file versions

### Exception Review Page

Show:

- Severity
- Category
- Participant
- Message
- Expected vs actual values
- Recommended resolution
- Assignment
- Resolution history

### Approval Page

Show:

- Contribution totals
- Exception summary
- Open blocking issues
- File preview
- Approval certification
- Required checkbox
- Approve button
- Download audit package

### Audit Package Page

Generate:

- Source file checksum
- Payroll totals
- Validation report
- Exception report
- Approval record
- Contribution output file
- Submission confirmation
- Audit events

---

## 13. Background Jobs

Use background jobs for:

- Payroll API syncs
- Token refreshes
- CSV parsing
- Validation runs
- Contribution file generation
- Notification emails
- Timeliness checks
- Scheduled reconciliation
- Backup verification
- File virus scan status checks

Job requirements:

- Idempotency
- Retry limits
- Dead-letter queue
- Failure alerts
- Audit events
- Safe error handling

---

## 14. Notifications

Notify users about:

- Sync completed
- Sync failed
- Critical exceptions
- Approval required
- Contribution file approved
- Contribution file submitted
- Late-risk payroll cycle
- Token connection expired
- New user invited
- Role changed

Notification channels:

- Email
- In-app
- Optional Slack/Microsoft Teams later

---

## 15. Reporting

Reports:

- Payroll cycle summary
- Contribution reconciliation
- Exception report
- Late-risk report
- Participant contribution detail
- Loan repayment report
- Eligibility mismatch report
- Sponsor approval report
- Audit event export
- SOC 2 evidence export

Reports must be exportable as:

- CSV
- PDF
- JSON where appropriate

---

## 16. SOC 2 Evidence Collection

Build an internal evidence area for future SOC 2 readiness.

Track:

- User access reviews
- Admin access changes
- Security incidents
- Vendor list
- Data subprocessors
- Deployment logs
- Change approvals
- Backup verification logs
- System uptime
- Vulnerability scans
- Pen test results
- Security policy acknowledgments

---

## 17. Incident Response

The app should include an internal incident log.

Incident fields:

- Incident type
- Severity
- Affected organization
- Affected company/plan
- Description
- Detected at
- Reported by
- Containment actions
- Resolution actions
- Root cause
- Customer notification required
- Closed at

Incident types:

- Security
- Data integrity
- Integration failure
- Availability
- Privacy
- Contribution processing error

---

## 18. Data Retention

Default retention target:

- Payroll and contribution records: at least 7 years
- Audit logs: at least 7 years
- Source files: at least 7 years unless client agreement states otherwise
- Security logs: minimum 1 year, longer preferred
- Temporary files: delete after processing

Retention must be configurable by client agreement.

Do not permanently delete client data without an approved retention/deletion workflow.

---

## 19. Backup and Disaster Recovery

Requirements:

- Automated daily database backups
- Point-in-time recovery where available
- Object storage versioning
- Backup restore testing
- Documented RPO and RTO
- Production access limited
- Disaster recovery runbook

Suggested targets:

- RPO: 24 hours or better
- RTO: 24-48 hours for MVP, better for enterprise

---

## 20. Change Management

SOC 2-ready change management requires:

- GitHub repository
- Pull requests
- Code review
- CI checks
- Deployment logs
- Production release notes
- Rollback plan
- Migration review
- Security review for auth, encryption, and sensitive data changes

Never push directly to production from local development.

---

## 21. Secure Development Practices

Required:

- TypeScript strict mode
- Zod input validation
- Unit tests for validation engine
- Integration tests for provider adapters
- Permission tests
- Audit logging tests
- File import tests
- Contribution calculation tests
- Dependency scanning
- Secret scanning
- Linting and formatting
- Error boundary handling
- Safe error messages

---

## 22. MVP Build Plan

### Phase 1 — Compliance-Ready File-Based MVP

Build first:

- Auth
- Organization/company/plan model
- RBAC
- CSV upload
- Secure file storage
- Column mapping
- Payroll run creation
- Normalization
- Validation engine
- Exception management
- Sponsor approval
- Contribution file generation
- Immutable audit logs
- Basic reporting

Do not build direct API integrations until the file-based core is reliable.

### Phase 2 — Paycor Read-Only Integration

Add:

- OAuth connection
- Employee sync
- Payroll run sync
- Deduction mapping
- API sync logs
- Token encryption
- Error handling
- Provider adapter tests

### Phase 3 — Additional Payroll Providers

Add:

- ADP
- Gusto
- Paychex
- iSolved
- QuickBooks Payroll

Use the same provider interface.

### Phase 4 — Write-Back Sync

Add:

- Deferral election write-back
- Loan repayment write-back
- Approval before write-back
- Provider confirmation logs
- Retry/idempotency controls

### Phase 5 — SOC 2 Preparation

Add:

- Evidence center
- Formal access review workflow
- Incident management
- Vendor risk register
- Backup verification logs
- Security policy acknowledgments
- Admin access monitoring

---

## 23. Definition of Done

A payroll cycle is complete only when:

- Source data is ingested
- File/API source is archived
- Data is normalized
- Validation is completed
- Exceptions are resolved, waived, or acknowledged
- Blocking issues are cleared or authorized
- Contribution totals reconcile
- Sponsor approval is recorded
- Contribution file is generated
- File checksum is stored
- Submission/funding status is tracked
- Audit package is complete

---

## 24. Things Not To Do

Do not:

- Store plaintext SSNs
- Store payroll provider passwords
- Log sensitive payloads
- Allow approval without authorization
- Allow deleted audit logs
- Allow unversioned plan rule changes
- Allow silent recalculation after approval
- Allow public file links
- Hardcode one payroll provider’s data model into the core
- Treat AI suggestions as final compliance decisions
- Build write-back before read-only sync is stable
- Submit contribution files without reconciliation
- Ignore failed syncs
- Ignore late-risk payroll cycles

---

## 25. Product Positioning

Nevatas should be positioned as:

> A secure payroll-to-retirement-plan operations platform for TPAs, advisors, payroll providers, and plan sponsors.

Differentiators:

- Provider-agnostic payroll integrations
- 401(k)-specific validation
- ERISA-safe workflows
- Sponsor approval controls
- Audit-ready evidence
- SOC 2-ready architecture
- CSV/SFTP fallback
- Future-ready bi-directional sync

---

## 26. Final Instruction to Claude Code

When generating code for this project:

1. Use TypeScript.
2. Use secure defaults.
3. Validate all inputs with Zod.
4. Enforce authorization server-side.
5. Add audit logging for every mutation.
6. Never expose sensitive fields to the client.
7. Keep provider-specific logic out of the core data model.
8. Version plan rules and generated files.
9. Use append-only audit logs.
10. Build the file-based MVP before direct API integrations.
11. Treat payroll and retirement data as highly sensitive financial data.
12. Prefer correctness, traceability, and sponsor control over speed.

The end goal is not just an app.

The end goal is a trusted compliance-grade infrastructure layer for retirement plan operations.
