-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "criticality" TEXT NOT NULL,
    "dataCategoriesJson" JSONB NOT NULL,
    "dpaUrl" TEXT,
    "websiteUrl" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastReviewedAt" TIMESTAMPTZ(3),
    "lastReviewedById" TEXT,
    "nextReviewDueAt" TIMESTAMPTZ(3),
    "retiredAt" TIMESTAMPTZ(3),
    "retiredById" TEXT,
    "retirementReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_status_nextReviewDueAt_idx" ON "Vendor"("status", "nextReviewDueAt");

-- CreateIndex
CREATE INDEX "Vendor_category_criticality_idx" ON "Vendor"("category", "criticality");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");
