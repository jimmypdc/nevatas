-- CreateTable
CREATE TABLE "AccessReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "notes" TEXT,
    "membershipSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessReviewItem" (
    "id" TEXT NOT NULL,
    "accessReviewId" TEXT NOT NULL,
    "organizationUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "mfaEnabled" BOOLEAN NOT NULL,
    "decision" TEXT,
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessReview_organizationId_createdAt_idx" ON "AccessReview"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessReview_status_createdAt_idx" ON "AccessReview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AccessReviewItem_accessReviewId_idx" ON "AccessReviewItem"("accessReviewId");

-- CreateIndex
CREATE INDEX "AccessReviewItem_accessReviewId_decision_idx" ON "AccessReviewItem"("accessReviewId", "decision");

-- AddForeignKey
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReviewItem" ADD CONSTRAINT "AccessReviewItem_accessReviewId_fkey" FOREIGN KEY ("accessReviewId") REFERENCES "AccessReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
