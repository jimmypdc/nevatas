-- Admin impersonation session tracking + dual-attribution column on
-- AuditEvent. See lib/services/impersonation.ts.

CREATE TABLE "ImpersonationSession" (
  "id"              TEXT NOT NULL,
  "adminUserId"     TEXT NOT NULL,
  "adminPriorOrgId" TEXT,
  "targetUserId"    TEXT NOT NULL,
  "reason"          TEXT NOT NULL,
  "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "endedAt"         TIMESTAMP(3),
  "endedReason"     TEXT,
  CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImpersonationSession_adminUserId_startedAt_idx"
  ON "ImpersonationSession"("adminUserId", "startedAt");
CREATE INDEX "ImpersonationSession_targetUserId_startedAt_idx"
  ON "ImpersonationSession"("targetUserId", "startedAt");

-- AuditEvent: dual-attribution column for impersonation. AuditEvent is
-- append-only at the trigger layer (migration 20260501000001); a column
-- ADD doesn't trip the no-update trigger because it's a DDL change.
ALTER TABLE "AuditEvent" ADD COLUMN "impersonatedBy" TEXT;
CREATE INDEX "AuditEvent_impersonatedBy_createdAt_idx"
  ON "AuditEvent"("impersonatedBy", "createdAt");
