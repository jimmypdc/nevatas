// Evidence exports: build CSV documents from the live audit / security
// tables. Each function returns the bytes + a filename; the API route
// handler is responsible for HTTP framing + the data.exported audit event.
//
// Scope-wide queries (no organizationId filter) since the evidence center
// is gated on platform.impersonate. If we ever expose per-org evidence
// exports we'll add a separate code path that filters on actor's org.

import { db } from "@/lib/db";
import { csvSafeFile } from "@/lib/csv/export";

export type EvidenceExportType =
  | "audit-events"
  | "admin-actions"
  | "login-attempts"
  | "access-review"
  | "access-reviews"
  | "sponsor-approvals"
  | "impersonation-sessions"
  | "background-jobs"
  | "incidents"
  | "vendors";

export type EvidenceExport = {
  filename: string;
  csv: string;
  rowCount: number;
};

const ADMIN_AUDIT_ACTIONS = [
  "admin.impersonation.started",
  "admin.impersonation.stopped",
  "admin.impersonation.expired",
  "admin.impersonation.blocked_action",
  "file.scan.overridden",
  "user.role.changed",
  "user.invited",
  "user.invite.revoked",
  "user.removed",
  "plan_rule.changed",
  "plan_rule.version.created",
  "payroll_connection.created",
  "auth.password.reset.completed",
  "auth.mfa.disabled",
];

// Defaults: 90-day window for time-windowed exports. Auditors typically
// request quarterly and tweak from there. Override via the `since` arg.
const DEFAULT_WINDOW_DAYS = 90;
const MAX_ROWS_PER_EXPORT = 50_000;

export async function buildEvidenceExport(
  type: EvidenceExportType,
  opts: { sinceIso?: string } = {},
): Promise<EvidenceExport> {
  const since = opts.sinceIso
    ? new Date(opts.sinceIso)
    : new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 3600 * 1000);
  const stamp = new Date().toISOString().slice(0, 10);

  switch (type) {
    case "audit-events":
      return exportAuditEvents(since, stamp);
    case "admin-actions":
      return exportAdminActions(since, stamp);
    case "login-attempts":
      return exportLoginAttempts(since, stamp);
    case "access-review":
      return exportAccessReview(stamp);
    case "access-reviews":
      return exportAccessReviews(stamp);
    case "sponsor-approvals":
      return exportSponsorApprovals(stamp);
    case "impersonation-sessions":
      return exportImpersonationSessions(stamp);
    case "background-jobs":
      return exportBackgroundJobs(stamp);
    case "incidents":
      return exportIncidents(stamp);
    case "vendors":
      return exportVendors(stamp);
  }
}

async function exportAuditEvents(since: Date, stamp: string): Promise<EvidenceExport> {
  const rows = await db.auditEvent.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS_PER_EXPORT,
    select: {
      id: true,
      createdAt: true,
      action: true,
      actorUserId: true,
      actorType: true,
      impersonatedBy: true,
      organizationId: true,
      companyId: true,
      planId: true,
      entityType: true,
      entityId: true,
      ipAddress: true,
      userAgent: true,
      requestId: true,
      beforeHash: true,
      afterHash: true,
    },
  });
  const csv = csvSafeFile(
    [
      "id",
      "created_at",
      "action",
      "actor_user_id",
      "actor_type",
      "impersonated_by",
      "organization_id",
      "company_id",
      "plan_id",
      "entity_type",
      "entity_id",
      "ip_address",
      "user_agent",
      "request_id",
      "before_hash",
      "after_hash",
    ],
    rows.map((r) => [
      r.id,
      r.createdAt,
      r.action,
      r.actorUserId,
      r.actorType,
      r.impersonatedBy,
      r.organizationId,
      r.companyId,
      r.planId,
      r.entityType,
      r.entityId,
      r.ipAddress,
      r.userAgent,
      r.requestId,
      r.beforeHash,
      r.afterHash,
    ]),
  );
  return { filename: `audit-events_since-${since.toISOString().slice(0, 10)}_${stamp}.csv`, csv, rowCount: rows.length };
}

async function exportAdminActions(since: Date, stamp: string): Promise<EvidenceExport> {
  const rows = await db.auditEvent.findMany({
    where: { createdAt: { gte: since }, action: { in: ADMIN_AUDIT_ACTIONS } },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS_PER_EXPORT,
    select: {
      id: true,
      createdAt: true,
      action: true,
      actorUserId: true,
      impersonatedBy: true,
      organizationId: true,
      entityType: true,
      entityId: true,
      ipAddress: true,
      userAgent: true,
    },
  });
  const csv = csvSafeFile(
    ["id", "created_at", "action", "actor_user_id", "impersonated_by", "organization_id", "entity_type", "entity_id", "ip_address", "user_agent"],
    rows.map((r) => [
      r.id,
      r.createdAt,
      r.action,
      r.actorUserId,
      r.impersonatedBy,
      r.organizationId,
      r.entityType,
      r.entityId,
      r.ipAddress,
      r.userAgent,
    ]),
  );
  return { filename: `admin-actions_since-${since.toISOString().slice(0, 10)}_${stamp}.csv`, csv, rowCount: rows.length };
}

async function exportLoginAttempts(since: Date, stamp: string): Promise<EvidenceExport> {
  const rows = await db.loginAttempt.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS_PER_EXPORT,
  });
  const csv = csvSafeFile(
    ["id", "created_at", "email_lower", "user_id", "outcome", "reason", "ip_address", "user_agent"],
    rows.map((r) => [
      r.id,
      r.createdAt,
      r.emailLower,
      r.userId,
      r.outcome,
      r.reason,
      r.ipAddress,
      r.userAgent,
    ]),
  );
  return { filename: `login-attempts_since-${since.toISOString().slice(0, 10)}_${stamp}.csv`, csv, rowCount: rows.length };
}

async function exportAccessReview(stamp: string): Promise<EvidenceExport> {
  const memberships = await db.organizationUser.findMany({
    where: { status: "active" },
    include: {
      organization: { select: { name: true, slug: true } },
      role: { select: { name: true, key: true } },
      user: {
        select: {
          id: true,
          email: true,
          mfaEnabled: true,
          mfaEnrolledAt: true,
          lockedUntil: true,
          lastFailedLoginAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ organization: { name: "asc" } }, { user: { email: "asc" } }],
    take: MAX_ROWS_PER_EXPORT,
  });

  // Last successful login per user, one pass.
  const emails = Array.from(new Set(memberships.map((m) => m.user.email.toLowerCase())));
  const successes =
    emails.length > 0
      ? await db.loginAttempt.findMany({
          where: { emailLower: { in: emails }, outcome: "succeeded" },
          orderBy: { createdAt: "desc" },
          select: { emailLower: true, createdAt: true },
          take: MAX_ROWS_PER_EXPORT,
        })
      : [];
  const lastLoginByEmail = new Map<string, Date>();
  for (const a of successes) {
    if (!lastLoginByEmail.has(a.emailLower)) {
      lastLoginByEmail.set(a.emailLower, a.createdAt);
    }
  }

  const now = new Date();
  const csv = csvSafeFile(
    [
      "organization",
      "organization_slug",
      "user_id",
      "email",
      "role",
      "role_key",
      "membership_status",
      "mfa_enabled",
      "mfa_enrolled_at",
      "account_locked",
      "locked_until",
      "last_successful_login",
      "last_failed_login",
      "user_created_at",
      "membership_created_at",
    ],
    memberships.map((m) => {
      const lastLogin = lastLoginByEmail.get(m.user.email.toLowerCase());
      const locked = m.user.lockedUntil && m.user.lockedUntil > now;
      return [
        m.organization.name,
        m.organization.slug,
        m.user.id,
        m.user.email,
        m.role.name,
        m.role.key,
        m.status,
        m.user.mfaEnabled ? "true" : "false",
        m.user.mfaEnrolledAt,
        locked ? "true" : "false",
        m.user.lockedUntil,
        lastLogin,
        m.user.lastFailedLoginAt,
        m.user.createdAt,
        m.createdAt,
      ];
    }),
  );
  return { filename: `access-review_${stamp}.csv`, csv, rowCount: memberships.length };
}

// One row per AccessReviewItem (flattened so each line is one decision).
// The review-level fields are duplicated on each row for spreadsheet ease.
async function exportAccessReviews(stamp: string): Promise<EvidenceExport> {
  const reviews = await db.accessReview.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS_PER_EXPORT,
    include: {
      organization: { select: { name: true, slug: true } },
      items: { orderBy: { userEmail: "asc" } },
    },
  });

  const rows: unknown[][] = [];
  for (const r of reviews) {
    for (const it of r.items) {
      rows.push([
        r.id,
        r.organization.name,
        r.organization.slug,
        r.periodStart,
        r.periodEnd,
        r.status,
        r.createdAt,
        r.createdById,
        r.completedAt,
        r.completedById,
        r.cancelledAt,
        r.cancelledById,
        r.cancelReason,
        r.notes,
        it.id,
        it.userEmail,
        it.roleKey,
        it.mfaEnabled ? "true" : "false",
        it.decision,
        it.decisionNote,
        it.decidedAt,
        it.decidedById,
      ]);
    }
  }

  const csv = csvSafeFile(
    [
      "review_id",
      "organization",
      "organization_slug",
      "period_start",
      "period_end",
      "status",
      "review_created_at",
      "review_created_by",
      "completed_at",
      "completed_by",
      "cancelled_at",
      "cancelled_by",
      "cancel_reason",
      "reviewer_notes",
      "item_id",
      "user_email",
      "role_key",
      "mfa_enabled",
      "decision",
      "decision_note",
      "decided_at",
      "decided_by",
    ],
    rows,
  );
  return { filename: `access-reviews_${stamp}.csv`, csv, rowCount: rows.length };
}

async function exportSponsorApprovals(stamp: string): Promise<EvidenceExport> {
  const rows = await db.approvalRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS_PER_EXPORT,
    include: {
      payrollRun: {
        select: {
          id: true,
          payrollDate: true,
          plan: { select: { name: true, company: { select: { name: true } } } },
        },
      },
    },
  });
  const csv = csvSafeFile(
    [
      "id",
      "created_at",
      "payroll_run_id",
      "payroll_date",
      "company",
      "plan",
      "contribution_file_id",
      "approved_by_user_id",
      "certification_text",
      "file_checksum",
      "ip_address",
      "user_agent",
      "invalidated_at",
      "invalidation_reason",
    ],
    rows.map((r) => [
      r.id,
      r.createdAt,
      r.payrollRun.id,
      r.payrollRun.payrollDate.toISOString().slice(0, 10),
      r.payrollRun.plan.company.name,
      r.payrollRun.plan.name,
      r.contributionFileId,
      r.approvedById,
      r.certificationText,
      r.fileChecksum,
      r.ipAddress,
      r.userAgent,
      r.invalidatedAt,
      r.invalidationReason,
    ]),
  );
  return { filename: `sponsor-approvals_${stamp}.csv`, csv, rowCount: rows.length };
}

async function exportImpersonationSessions(stamp: string): Promise<EvidenceExport> {
  const rows = await db.impersonationSession.findMany({
    orderBy: { startedAt: "desc" },
    take: MAX_ROWS_PER_EXPORT,
  });
  const csv = csvSafeFile(
    [
      "id",
      "started_at",
      "expires_at",
      "ended_at",
      "ended_reason",
      "admin_user_id",
      "admin_prior_org_id",
      "target_user_id",
      "reason",
    ],
    rows.map((r) => [
      r.id,
      r.startedAt,
      r.expiresAt,
      r.endedAt,
      r.endedReason,
      r.adminUserId,
      r.adminPriorOrgId,
      r.targetUserId,
      r.reason,
    ]),
  );
  return { filename: `impersonation-sessions_${stamp}.csv`, csv, rowCount: rows.length };
}

// One row per incident header. Timeline updates are not exported — they
// would explode the row count and auditors typically want the summary
// view. (If they ask, we can add an updates-flattened variant.)
async function exportIncidents(stamp: string): Promise<EvidenceExport> {
  const rows = await db.incident.findMany({
    orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
    take: MAX_ROWS_PER_EXPORT,
    include: { organization: { select: { name: true, slug: true } } },
  });
  const csv = csvSafeFile(
    [
      "id",
      "organization",
      "organization_slug",
      "incident_type",
      "severity",
      "status",
      "title",
      "description",
      "detected_at",
      "reported_by",
      "customer_notification_required",
      "customer_notification_decided_at",
      "customer_notification_decided_by",
      "customer_notification_notes",
      "root_cause",
      "containment_actions",
      "resolution_actions",
      "closed_at",
      "closed_by",
      "created_at",
    ],
    rows.map((r) => [
      r.id,
      r.organization?.name ?? "",
      r.organization?.slug ?? "",
      r.incidentType,
      r.severity,
      r.status,
      r.title,
      r.description,
      r.detectedAt,
      r.reportedById,
      r.customerNotificationRequired === null
        ? ""
        : r.customerNotificationRequired
          ? "true"
          : "false",
      r.customerNotificationDecidedAt,
      r.customerNotificationDecidedById,
      r.customerNotificationNotes,
      r.rootCause,
      r.containmentActions,
      r.resolutionActions,
      r.closedAt,
      r.closedById,
      r.createdAt,
    ]),
  );
  return { filename: `incidents_${stamp}.csv`, csv, rowCount: rows.length };
}

async function exportVendors(stamp: string): Promise<EvidenceExport> {
  const rows = await db.vendor.findMany({
    orderBy: [{ status: "asc" }, { criticality: "desc" }, { name: "asc" }],
    take: MAX_ROWS_PER_EXPORT,
  });
  const csv = csvSafeFile(
    [
      "id",
      "name",
      "description",
      "category",
      "criticality",
      "data_categories",
      "dpa_url",
      "website_url",
      "contact_email",
      "status",
      "last_reviewed_at",
      "last_reviewed_by",
      "next_review_due_at",
      "retired_at",
      "retired_by",
      "retirement_reason",
      "notes",
      "created_at",
    ],
    rows.map((r) => [
      r.id,
      r.name,
      r.description,
      r.category,
      r.criticality,
      Array.isArray(r.dataCategoriesJson) ? (r.dataCategoriesJson as string[]).join("; ") : "",
      r.dpaUrl,
      r.websiteUrl,
      r.contactEmail,
      r.status,
      r.lastReviewedAt,
      r.lastReviewedById,
      r.nextReviewDueAt,
      r.retiredAt,
      r.retiredById,
      r.retirementReason,
      r.notes,
      r.createdAt,
    ]),
  );
  return { filename: `vendors_${stamp}.csv`, csv, rowCount: rows.length };
}

async function exportBackgroundJobs(stamp: string): Promise<EvidenceExport> {
  const rows = await db.backgroundJob.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS_PER_EXPORT,
    select: {
      id: true,
      jobType: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      runAfter: true,
      startedAt: true,
      completedAt: true,
      errorMessage: true,
      organizationId: true,
      companyId: true,
      actorUserId: true,
      requestId: true,
      createdAt: true,
    },
  });
  const csv = csvSafeFile(
    [
      "id",
      "job_type",
      "status",
      "attempts",
      "max_attempts",
      "run_after",
      "started_at",
      "completed_at",
      "error_message",
      "organization_id",
      "company_id",
      "actor_user_id",
      "request_id",
      "created_at",
    ],
    rows.map((r) => [
      r.id,
      r.jobType,
      r.status,
      r.attempts,
      r.maxAttempts,
      r.runAfter,
      r.startedAt,
      r.completedAt,
      r.errorMessage,
      r.organizationId,
      r.companyId,
      r.actorUserId,
      r.requestId,
      r.createdAt,
    ]),
  );
  return { filename: `background-jobs_${stamp}.csv`, csv, rowCount: rows.length };
}
