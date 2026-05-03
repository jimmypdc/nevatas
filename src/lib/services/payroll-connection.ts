// PayrollConnection service. Owns the create / lookup / update lifecycle
// for a tenant's connection to a payroll provider, including the
// encryption boundary on the OAuth tokens.
//
// Tokens are stored AES-256-GCM-encrypted (envelope encryption when
// KMS_DRIVER=aws). Plaintext only exists transiently inside the adapter
// invocation; nothing else in the codebase decrypts them.

import { db } from "@/lib/db";
import {
  decryptOptional,
  encryptOptional,
} from "@/lib/crypto/encryption";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import type { PayrollProviderName } from "@/lib/integrations/types";

export type EncryptedTokenBundle = {
  accessToken?: string | null;
  refreshToken?: string | null;
  accessTokenExpiresAt?: string | null; // ISO
  scopes?: string[] | null;
};

export type PlainTokenBundle = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
  scopes?: string[];
};

export type CreateConnectionInput = {
  organizationId: string;
  companyId: string;
  actorUserId?: string;
  provider: PayrollProviderName;
  // Provider-side identifier for the connected account (Paycor account id,
  // ADP client id). Useful for ops + matches what the provider's own
  // dashboards show.
  providerAccountId?: string;
  providerCompanyName?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function createConnection(input: CreateConnectionInput) {
  const conn = await db.payrollConnection.create({
    data: {
      companyId: input.companyId,
      provider: input.provider,
      status: "inactive", // flips to active once OAuth tokens land
      settingsJson: {
        providerAccountId: input.providerAccountId ?? null,
        providerCompanyName: input.providerCompanyName ?? null,
      },
    },
  });
  await writeAudit({
    organizationId: input.organizationId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: AUDIT_ACTIONS.payrollConnectionCreated,
    entityType: "payroll_connection",
    entityId: conn.id,
    after: {
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      providerCompanyName: input.providerCompanyName,
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });
  return conn;
}

export async function getConnectionScoped(params: {
  organizationId: string;
  connectionId: string;
}) {
  const conn = await db.payrollConnection.findUnique({
    where: { id: params.connectionId },
    include: { company: { select: { organizationId: true } } },
  });
  if (!conn || conn.company.organizationId !== params.organizationId) {
    throw notFound("Payroll connection");
  }
  return conn;
}

// Encrypts the supplied tokens and persists them on the connection. Flips
// status to active. Audit lands as token.refreshed when called from the
// refresh path; pass actionOverride for first-time connect.
export async function persistTokens(params: {
  organizationId: string;
  companyId: string;
  actorUserId?: string;
  connectionId: string;
  tokens: PlainTokenBundle;
  reason: "initial_connect" | "refresh";
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}): Promise<void> {
  const encrypted: EncryptedTokenBundle = {
    accessToken: await encryptOptional(params.tokens.accessToken),
    refreshToken: await encryptOptional(params.tokens.refreshToken ?? null),
    accessTokenExpiresAt:
      params.tokens.accessTokenExpiresAt?.toISOString() ?? null,
    scopes: params.tokens.scopes ?? null,
  };

  await db.payrollConnection.update({
    where: { id: params.connectionId },
    data: {
      status: "active",
      encryptedTokens: encrypted as unknown as object,
    },
  });

  await writeAudit({
    organizationId: params.organizationId,
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action:
      params.reason === "initial_connect"
        ? AUDIT_ACTIONS.payrollConnectionCreated
        : AUDIT_ACTIONS.payrollTokenRefreshed,
    entityType: "payroll_connection",
    entityId: params.connectionId,
    metadata: {
      reason: params.reason,
      // NEVER write the actual token bytes into the audit row.
      tokenExpiresAt: params.tokens.accessTokenExpiresAt?.toISOString(),
      scopeCount: params.tokens.scopes?.length ?? 0,
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    requestId: params.requestId,
  });
}

// Decrypts and returns the connection's current tokens. Throws if no
// tokens have been persisted yet.
export async function getDecryptedTokens(connectionId: string): Promise<PlainTokenBundle | null> {
  const conn = await db.payrollConnection.findUnique({
    where: { id: connectionId },
    select: { encryptedTokens: true },
  });
  if (!conn?.encryptedTokens) return null;
  const enc = conn.encryptedTokens as unknown as EncryptedTokenBundle;
  if (!enc.accessToken) return null;
  return {
    accessToken: (await decryptOptional(enc.accessToken))!,
    refreshToken: (await decryptOptional(enc.refreshToken ?? null)) ?? undefined,
    accessTokenExpiresAt: enc.accessTokenExpiresAt
      ? new Date(enc.accessTokenExpiresAt)
      : undefined,
    scopes: enc.scopes ?? undefined,
  };
}

// Refresh the OAuth tokens on a connection by asking its adapter. Used by
// adapter wrappers on 401, by scheduled refresh jobs, and by the manual
// "Reconnect" button. Idempotent in spirit — calling it twice in a row is
// safe (each call mints a new access token).
//
// Returns the new access token expiry so the caller can decide whether to
// schedule the next refresh. Returns null if the adapter doesn't support
// refresh (some providers don't).
export async function refreshConnectionTokens(params: {
  organizationId: string;
  companyId: string;
  connectionId: string;
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}): Promise<{ accessTokenExpiresAt?: Date } | null> {
  // Lazy import to avoid a cycle: the registry imports adapters which may
  // import this service for token plumbing in the future.
  const { adapterFor } = await import("@/lib/integrations/registry");
  const conn = await db.payrollConnection.findUnique({
    where: { id: params.connectionId },
    select: { provider: true },
  });
  if (!conn) throw notFound("Payroll connection");
  const adapter = adapterFor(conn.provider as Parameters<typeof adapterFor>[0]);
  if (!adapter.refreshToken) return null;

  const result = await adapter.refreshToken(params.connectionId);
  await persistTokens({
    organizationId: params.organizationId,
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    connectionId: params.connectionId,
    tokens: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
    },
    reason: "refresh",
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    requestId: params.requestId,
  });
  return { accessTokenExpiresAt: result.accessTokenExpiresAt };
}

// Disconnect: wipe encrypted tokens and flip status to inactive. Soft —
// the row stays so the audit trail of past syncs remains attributable.
// A future /connect for the same (company, provider) reuses this row.
export async function disconnectConnection(params: {
  organizationId: string;
  companyId: string;
  actorUserId?: string;
  connectionId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}): Promise<void> {
  await db.payrollConnection.update({
    where: { id: params.connectionId },
    data: {
      status: "inactive",
      // Nullable Json column — Prisma's strict typing wants a special
      // sentinel here, but a plain null is what actually lands in Postgres.
      // Cast keeps the runtime behavior while sidestepping the type union.
      encryptedTokens: null as unknown as undefined,
    },
  });
  await writeAudit({
    organizationId: params.organizationId,
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: AUDIT_ACTIONS.payrollConnectionCreated, // status changes share this action
    entityType: "payroll_connection",
    entityId: params.connectionId,
    metadata: { phase: "disconnected", newStatus: "inactive" },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    requestId: params.requestId,
  });
}

export async function setConnectionStatus(params: {
  organizationId: string;
  connectionId: string;
  status: "active" | "inactive" | "error" | "reauth_required";
  reason?: string;
}): Promise<void> {
  await db.payrollConnection.update({
    where: { id: params.connectionId },
    data: { status: params.status },
  });
  await writeAudit({
    organizationId: params.organizationId,
    action: AUDIT_ACTIONS.payrollConnectionCreated, // reuses; status changes are noisy enough already
    entityType: "payroll_connection",
    entityId: params.connectionId,
    metadata: { newStatus: params.status, reason: params.reason },
  });
}
