-- Postgres-backed background job queue.

CREATE TABLE "BackgroundJob" (
  "id"             TEXT NOT NULL,
  "jobType"        TEXT NOT NULL,
  "payloadJson"    JSONB NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'queued',
  "idempotencyKey" TEXT,
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "maxAttempts"    INTEGER NOT NULL DEFAULT 5,
  "runAfter"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"      TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "errorMessage"   TEXT,
  "organizationId" TEXT NOT NULL,
  "companyId"      TEXT,
  "actorUserId"    TEXT,
  "requestId"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackgroundJob_idempotencyKey_key" ON "BackgroundJob"("idempotencyKey");
CREATE INDEX "BackgroundJob_status_runAfter_idx" ON "BackgroundJob"("status", "runAfter");
CREATE INDEX "BackgroundJob_jobType_status_idx" ON "BackgroundJob"("jobType", "status");
CREATE INDEX "BackgroundJob_organizationId_createdAt_idx" ON "BackgroundJob"("organizationId", "createdAt");
