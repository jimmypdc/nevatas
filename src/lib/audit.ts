// Audit logging. Append-only — never call db.auditEvent.update / .delete from
// application code. The append-only invariant is enforced at the database
// layer by triggers installed in
// prisma/migrations/20260501000001_audit_log_immutability/migration.sql; any
// UPDATE / DELETE / TRUNCATE on AuditEvent will raise SQLSTATE 42501.

import type { Prisma, PrismaClient } from "@prisma/client";

import { getAuditContext } from "@/lib/audit/context";
import { db } from "@/lib/db";
import { hashSnapshot } from "@/lib/crypto/hashing";

export const AUDIT_ACTIONS = {
  // Auth
  authLoginSucceeded: "auth.login.succeeded",
  authLoginFailed: "auth.login.failed",
  authLogout: "auth.logout",
  authMfaChallenge: "auth.mfa.challenge",
  authPasswordResetRequested: "auth.password.reset.requested",
  authPasswordResetCompleted: "auth.password.reset.completed",
  authPasswordResetFailed: "auth.password.reset.failed",
  // MFA lifecycle
  mfaEnrollmentBegan: "auth.mfa.enrollment.began",
  mfaEnrolled: "auth.mfa.enrolled",
  mfaDisabled: "auth.mfa.disabled",
  mfaRecoveryCodeUsed: "auth.mfa.recovery_code.used",
  mfaRecoveryCodesRegenerated: "auth.mfa.recovery_codes.regenerated",

  // Users & roles
  userInvited: "user.invited",
  userInviteRevoked: "user.invite.revoked",
  userInviteAccepted: "user.invite.accepted",
  userRemoved: "user.removed",
  roleChanged: "user.role.changed",
  organizationSwitched: "user.organization.switched",

  // Payroll connections
  payrollConnectionCreated: "payroll_connection.created",
  payrollTokenRefreshed: "payroll_connection.token.refreshed",
  payrollSyncStarted: "payroll_sync.started",
  payrollSyncCompleted: "payroll_sync.completed",
  payrollSyncFailed: "payroll_sync.failed",

  // Files
  fileUploaded: "file.uploaded",
  fileParsed: "file.parsed",
  fileMappingChanged: "file.mapping.changed",
  fileScanQueued: "file.scan.queued",
  fileScanCompleted: "file.scan.completed",
  fileScanFailed: "file.scan.failed",
  fileScanOverridden: "file.scan.overridden",

  // Background jobs
  jobEnqueued: "job.enqueued",
  jobSucceeded: "job.succeeded",
  jobFailed: "job.failed",
  jobDead: "job.dead",

  // Notifications
  notificationEmailSent: "notification.email.sent",
  notificationEmailFailed: "notification.email.failed",

  // Plan rules
  planRuleVersionCreated: "plan_rule.version.created",
  planRuleChanged: "plan_rule.changed",

  // Validation
  validationRunCompleted: "validation.run.completed",

  // Exceptions
  exceptionCreated: "exception.created",
  exceptionResolved: "exception.resolved",
  exceptionWaived: "exception.waived",

  // Contribution & approval
  contributionFileGenerated: "contribution_file.generated",
  sponsorApprovalRecorded: "contribution.approval.recorded",
  approvalInvalidated: "contribution.approval.invalidated",
  contributionFileSubmitted: "contribution_file.submitted",
  contributionFileFundingRecorded: "contribution_file.funding.recorded",
  validationIssueAutoResolvedByFunding: "validation.issue.auto_resolved_by_funding",

  // Correction cycle
  correctionCycleOpened: "correction_cycle.opened",
  correctionCycleClosed: "correction_cycle.closed",
  correctionCycleAbandoned: "correction_cycle.abandoned",

  // Write-back
  writebackPerformed: "writeback.performed",

  // Access review (SOC 2 CC6.3)
  accessReviewStarted: "access_review.started",
  accessReviewItemDecided: "access_review.item.decided",
  accessReviewCompleted: "access_review.completed",
  accessReviewCancelled: "access_review.cancelled",

  // Misc
  dataExported: "data.exported",
  adminImpersonationStarted: "admin.impersonation.started",
  adminImpersonationStopped: "admin.impersonation.stopped",
  adminImpersonationExpired: "admin.impersonation.expired",
  adminImpersonationBlockedAction: "admin.impersonation.blocked_action",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export type AuditWriteInput = {
  organizationId: string;
  companyId?: string;
  planId?: string;
  actorUserId?: string;
  actorType?: "user" | "system" | "api" | "job";
  // Set when the action was performed during admin impersonation. The audit
  // event keeps actorUserId as the impersonated (effective) user — so
  // existing org-scoped queries still attribute correctly — and adds the
  // admin's user id here for dual-attribution.
  //
  // Callers normally don't set this directly: requireActor() binds the
  // impersonatedBy via lib/audit/context (AsyncLocalStorage) and writeAudit
  // pulls from there automatically. Pass it explicitly only when the audit
  // event is written outside a requireActor()-rooted async chain (e.g., the
  // impersonation start/stop endpoints themselves, where the admin id is
  // known but the request hasn't yet set up the context).
  impersonatedBy?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

type Tx = PrismaClient | Prisma.TransactionClient;

// Write a single audit event. Pass a Prisma transaction client to keep the
// event in the same transaction as the underlying mutation.
export async function writeAudit(input: AuditWriteInput, tx: Tx = db): Promise<void> {
  // Auto-stamp impersonatedBy from the per-request audit context unless the
  // caller passed an explicit value (impersonation start/stop endpoints do).
  const impersonatedBy = input.impersonatedBy ?? getAuditContext()?.impersonatedBy;

  await tx.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      companyId: input.companyId,
      planId: input.planId,
      actorUserId: input.actorUserId,
      actorType: input.actorType ?? (input.actorUserId ? "user" : "system"),
      impersonatedBy,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeHash: input.before === undefined ? null : hashSnapshot(input.before),
      afterHash: input.after === undefined ? null : hashSnapshot(input.after),
      metadataJson: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    },
  });
}
