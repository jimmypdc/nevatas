-- CreateTable
CREATE TABLE "BackupVerification" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "notes" TEXT,
    "metadataJson" JSONB,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupVerification_source_reportedAt_idx" ON "BackupVerification"("source", "reportedAt");

-- CreateIndex
CREATE INDEX "BackupVerification_status_reportedAt_idx" ON "BackupVerification"("status", "reportedAt");
