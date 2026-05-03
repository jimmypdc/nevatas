-- Per-participant 401(k) loan amortization. Used by the loan-repayment
-- validators to flag missed / over / underpaid loan repayments.

CREATE TABLE "LoanSchedule" (
  "id"                    TEXT NOT NULL,
  "participantId"         TEXT NOT NULL,
  "loanNumber"            TEXT NOT NULL,
  "originationDate"       TIMESTAMP(3) NOT NULL,
  "principalAmount"       DECIMAL(18, 2) NOT NULL,
  "expectedPaymentAmount" DECIMAL(18, 2) NOT NULL,
  "paymentFrequency"      TEXT NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'active',
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoanSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoanSchedule_participantId_loanNumber_key"
  ON "LoanSchedule"("participantId", "loanNumber");
CREATE INDEX "LoanSchedule_participantId_status_idx"
  ON "LoanSchedule"("participantId", "status");

ALTER TABLE "LoanSchedule"
  ADD CONSTRAINT "LoanSchedule_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
