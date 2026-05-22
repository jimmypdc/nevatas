-- CreateTable
CREATE TABLE "WritebackRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollConnectionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "approvalNote" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "providerRequestId" TEXT,
    "providerConfirmationId" TEXT,
    "providerResponseJson" JSONB,
    "submittedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WritebackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WritebackRequest_providerRequestId_key" ON "WritebackRequest"("providerRequestId");

-- CreateIndex
CREATE INDEX "WritebackRequest_payrollConnectionId_status_idx" ON "WritebackRequest"("payrollConnectionId", "status");

-- CreateIndex
CREATE INDEX "WritebackRequest_participantId_requestType_idx" ON "WritebackRequest"("participantId", "requestType");

-- CreateIndex
CREATE INDEX "WritebackRequest_status_createdAt_idx" ON "WritebackRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "WritebackRequest" ADD CONSTRAINT "WritebackRequest_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritebackRequest" ADD CONSTRAINT "WritebackRequest_payrollConnectionId_fkey" FOREIGN KEY ("payrollConnectionId") REFERENCES "PayrollConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
