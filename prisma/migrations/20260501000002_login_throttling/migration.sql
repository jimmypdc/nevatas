-- Login attempt logging + per-user lockout state for brute-force defense.

ALTER TABLE "User"
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastFailedLoginAt" TIMESTAMP(3);

CREATE TABLE "LoginAttempt" (
  "id" TEXT NOT NULL,
  "emailLower" TEXT NOT NULL,
  "userId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "outcome" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginAttempt_emailLower_createdAt_idx" ON "LoginAttempt"("emailLower", "createdAt");
CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx"  ON "LoginAttempt"("ipAddress", "createdAt");
CREATE INDEX "LoginAttempt_userId_createdAt_idx"    ON "LoginAttempt"("userId", "createdAt");

-- LoginAttempt is also append-only — same trigger pattern as AuditEvent.
CREATE OR REPLACE FUNCTION nevatas_reject_login_attempt_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'LoginAttempt rows are append-only and cannot be modified or deleted'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS login_attempt_no_update ON "LoginAttempt";
CREATE TRIGGER login_attempt_no_update
BEFORE UPDATE ON "LoginAttempt"
FOR EACH ROW EXECUTE FUNCTION nevatas_reject_login_attempt_mutation();

DROP TRIGGER IF EXISTS login_attempt_no_delete ON "LoginAttempt";
CREATE TRIGGER login_attempt_no_delete
BEFORE DELETE ON "LoginAttempt"
FOR EACH ROW EXECUTE FUNCTION nevatas_reject_login_attempt_mutation();

DROP TRIGGER IF EXISTS login_attempt_no_truncate ON "LoginAttempt";
CREATE TRIGGER login_attempt_no_truncate
BEFORE TRUNCATE ON "LoginAttempt"
FOR EACH STATEMENT EXECUTE FUNCTION nevatas_reject_login_attempt_mutation();
