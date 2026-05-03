-- Outbound email log. Append-only-by-convention; only status transitions
-- (queued → sent / failed / bounced) are mutated.

CREATE TABLE "EmailMessage" (
  "id"                 TEXT NOT NULL,
  "organizationId"     TEXT,
  "recipientUserId"    TEXT,
  "toEmail"            TEXT NOT NULL,
  "fromEmail"          TEXT NOT NULL,
  "template"           TEXT NOT NULL,
  "subject"            TEXT NOT NULL,
  "templateParamsJson" JSONB,
  "status"             TEXT NOT NULL DEFAULT 'queued',
  "providerName"       TEXT,
  "providerMessageId"  TEXT,
  "errorMessage"       TEXT,
  "sentAt"             TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailMessage_recipientUserId_createdAt_idx"
  ON "EmailMessage"("recipientUserId", "createdAt");
CREATE INDEX "EmailMessage_organizationId_createdAt_idx"
  ON "EmailMessage"("organizationId", "createdAt");
CREATE INDEX "EmailMessage_status_createdAt_idx"
  ON "EmailMessage"("status", "createdAt");
