-- Outstanding user invitations.

CREATE TABLE "Invitation" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "emailLower"       TEXT NOT NULL,
  "roleId"           TEXT NOT NULL,
  "inviterUserId"    TEXT NOT NULL,
  "tokenHash"        TEXT NOT NULL,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "acceptedAt"       TIMESTAMP(3),
  "acceptedByUserId" TEXT,
  "revokedAt"        TIMESTAMP(3),
  "revokedByUserId"  TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_organizationId_emailLower_idx"
  ON "Invitation"("organizationId", "emailLower");
CREATE INDEX "Invitation_organizationId_acceptedAt_revokedAt_idx"
  ON "Invitation"("organizationId", "acceptedAt", "revokedAt");

-- Only one live (not accepted, not revoked) invitation per (org, email).
-- Re-inviting an email with a live invite must first supersede the old one
-- in application code.
CREATE UNIQUE INDEX "Invitation_org_email_live_unique"
  ON "Invitation"("organizationId", "emailLower")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON UPDATE CASCADE;
