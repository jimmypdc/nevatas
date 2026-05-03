-- Correction cycle: reopen an approved/submitted payroll run for re-validation
-- and a new contribution file, without erasing the original history.

CREATE TABLE "CorrectionCycle" (
  "id"               TEXT NOT NULL,
  "payrollRunId"     TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'open',
  "reason"           TEXT NOT NULL,
  "supersededFileId" TEXT,
  "openedById"       TEXT,
  "openedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedById"       TEXT,
  "closedAt"         TIMESTAMP(3),
  "closeReason"      TEXT,
  CONSTRAINT "CorrectionCycle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CorrectionCycle_payrollRunId_status_idx"
  ON "CorrectionCycle"("payrollRunId", "status");

ALTER TABLE "CorrectionCycle"
  ADD CONSTRAINT "CorrectionCycle_payrollRunId_fkey"
  FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContributionFile"
  ADD COLUMN "correctionCycleId" TEXT;

CREATE INDEX "ContributionFile_correctionCycleId_idx"
  ON "ContributionFile"("correctionCycleId");

ALTER TABLE "ContributionFile"
  ADD CONSTRAINT "ContributionFile_correctionCycleId_fkey"
  FOREIGN KEY ("correctionCycleId") REFERENCES "CorrectionCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Only one open correction cycle per run at a time.
CREATE UNIQUE INDEX "CorrectionCycle_payrollRunId_open_unique"
  ON "CorrectionCycle"("payrollRunId")
  WHERE "status" = 'open';
