-- AlterTable
ALTER TABLE "ContributionFile" ADD COLUMN     "fundedAt" TIMESTAMPTZ(3),
ADD COLUMN     "fundedById" TEXT;

-- CreateIndex
CREATE INDEX "ContributionFile_payrollRunId_fundedAt_idx" ON "ContributionFile"("payrollRunId", "fundedAt");
