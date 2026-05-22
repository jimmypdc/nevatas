-- CreateTable
CREATE TABLE "SecurityPolicy" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "retiredById" TEXT,
    "retiredAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SecurityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityPolicyVersion" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "changeSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityPolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityPolicyAcknowledgment" (
    "id" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityPolicyAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityPolicy_key_key" ON "SecurityPolicy"("key");

-- CreateIndex
CREATE INDEX "SecurityPolicy_status_idx" ON "SecurityPolicy"("status");

-- CreateIndex
CREATE INDEX "SecurityPolicyVersion_policyId_status_idx" ON "SecurityPolicyVersion"("policyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityPolicyVersion_policyId_version_key" ON "SecurityPolicyVersion"("policyId", "version");

-- CreateIndex
CREATE INDEX "SecurityPolicyAcknowledgment_userId_createdAt_idx" ON "SecurityPolicyAcknowledgment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityPolicyAcknowledgment_policyVersionId_createdAt_idx" ON "SecurityPolicyAcknowledgment"("policyVersionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityPolicyAcknowledgment_policyVersionId_userId_key" ON "SecurityPolicyAcknowledgment"("policyVersionId", "userId");

-- AddForeignKey
ALTER TABLE "SecurityPolicyVersion" ADD CONSTRAINT "SecurityPolicyVersion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SecurityPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityPolicyAcknowledgment" ADD CONSTRAINT "SecurityPolicyAcknowledgment_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "SecurityPolicyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
