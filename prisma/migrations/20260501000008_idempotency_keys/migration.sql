-- Stripe-style request idempotency. See lib/api/idempotency.ts.

CREATE TABLE "IdempotencyKey" (
  "id"                  TEXT NOT NULL,
  "scope"               TEXT NOT NULL,
  "key"                 TEXT NOT NULL,
  "bodyHash"            TEXT NOT NULL,
  "status"              TEXT NOT NULL,
  "statusCode"          INTEGER,
  "responseBodyB64"     TEXT,
  "responseHeadersJson" JSONB,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");
