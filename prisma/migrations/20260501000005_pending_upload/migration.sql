-- Two-phase direct-browser upload tracker. Single row per init→complete cycle.

CREATE TABLE "PendingUpload" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "uploadedById"   TEXT NOT NULL,
  "fileName"       TEXT NOT NULL,
  "mimeType"       TEXT NOT NULL,
  "importType"     TEXT NOT NULL,
  "sizeBytes"      INTEGER NOT NULL,
  "sha256Hex"      TEXT NOT NULL,
  "storageKey"     TEXT NOT NULL,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "completedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingUpload_storageKey_key" ON "PendingUpload"("storageKey");
CREATE INDEX "PendingUpload_organizationId_status_createdAt_idx"
  ON "PendingUpload"("organizationId", "status", "createdAt");
CREATE INDEX "PendingUpload_expiresAt_idx" ON "PendingUpload"("expiresAt");
