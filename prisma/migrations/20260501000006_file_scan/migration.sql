-- Malware/CSV-injection scan lifecycle on PayrollSourceFile.

ALTER TABLE "PayrollSourceFile"
  ADD COLUMN "scanStatus"         TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "scanProvider"       TEXT,
  ADD COLUMN "scanCompletedAt"    TIMESTAMP(3),
  ADD COLUMN "scanResult"         JSONB,
  ADD COLUMN "scanOverrideById"   TEXT,
  ADD COLUMN "scanOverrideReason" TEXT,
  ADD COLUMN "scanOverrideAt"     TIMESTAMP(3);

CREATE INDEX "PayrollSourceFile_scanStatus_idx" ON "PayrollSourceFile"("scanStatus");

-- Existing rows uploaded before scanning was wired in have no verdict; mark
-- them "skipped" so they remain parseable without an explicit override.
UPDATE "PayrollSourceFile" SET "scanStatus" = 'skipped' WHERE "scanStatus" = 'pending';
