// Write-back request service. v1 supports deferral_election; the payload
// shape and request-type strings are designed so adding more
// requestTypes (loan_repayment, eligibility_indicator) is purely a
// matter of extending the payload schema + adapter call site below.
//
// Lifecycle:
//   draft → approved → in_flight → succeeded
//                    ↘ failed (terminal after maxAttempts; the request
//                              row stays in DB for audit, but no further
//                              attempts are scheduled)
//   draft → cancelled
//
// CLAUDE.md §8.11 invariants honored:
//   - Idempotency: providerRequestId is generated at approval time and
//     reused on retry, so the provider sees the same key across attempts.
//   - User approval: the job handler refuses to submit anything not in
//     "approved" status.
//   - Provider response logging: providerResponseJson stores the raw
//     adapter return value verbatim.
//   - No duplicate writebacks: refuseExistingActive() checks for any
//     non-terminal request matching (connection, participant, requestType)
//     before creating a new one. (Prisma's unique partial indexes are
//     awkward; the service-level check is fine because writebacks are
//     low-throughput.)

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs/queue";
import { JOB_TYPES } from "@/lib/jobs/registry";

export const WRITEBACK_REQUEST_TYPES = ["deferral_election"] as const;
export type WritebackRequestType = (typeof WRITEBACK_REQUEST_TYPES)[number];

// Terminal statuses don't block new requests for the same target.
const ACTIVE_STATUSES = ["draft", "approved", "in_flight"] as const;

export type DeferralElectionPayload = {
  // Effective date the provider should apply the change on.
  effectiveDate: string; // ISO date
  // At least one of percent / amount must be set per source. Setting
  // both is a configuration error (most providers reject it; we refuse
  // it ourselves so the issue surfaces at request time, not after the
  // failed job).
  preTaxPercent?: number;
  preTaxAmount?: number;
  rothPercent?: number;
  rothAmount?: number;
};

export function validateDeferralPayload(p: DeferralElectionPayload): void {
  if (!p.effectiveDate) throw validationError("effectiveDate is required");
  const d = new Date(p.effectiveDate);
  if (!Number.isFinite(d.getTime())) throw validationError("effectiveDate must be a valid date");
  // Reject percent + amount conflicts.
  if (p.preTaxPercent !== undefined && p.preTaxAmount !== undefined) {
    throw validationError("preTaxPercent and preTaxAmount cannot both be set");
  }
  if (p.rothPercent !== undefined && p.rothAmount !== undefined) {
    throw validationError("rothPercent and rothAmount cannot both be set");
  }
  // At least one source must be specified.
  if (
    p.preTaxPercent === undefined &&
    p.preTaxAmount === undefined &&
    p.rothPercent === undefined &&
    p.rothAmount === undefined
  ) {
    throw validationError("At least one of preTax or roth (percent or amount) is required");
  }
  // Range checks.
  for (const [k, v] of Object.entries(p)) {
    if (typeof v !== "number") continue;
    if (v < 0) throw validationError(`${k} cannot be negative`);
    if (k.endsWith("Percent") && v > 100) throw validationError(`${k} cannot exceed 100`);
    if (k.endsWith("Amount") && v > 1_000_000) throw validationError(`${k} is implausibly large`);
  }
}

export type CreateRequestInput = {
  actorUserId: string;
  organizationId: string;
  companyId: string;
  connectionId: string;
  participantId: string;
  requestType: WritebackRequestType;
  payload: DeferralElectionPayload;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function createWritebackRequest(
  input: CreateRequestInput,
): Promise<{ writebackId: string }> {
  if (input.requestType === "deferral_election") {
    validateDeferralPayload(input.payload);
  } else {
    throw validationError(`Unsupported writeback request type: ${input.requestType}`);
  }

  // Tenant + connection scope check.
  const conn = await db.payrollConnection.findUnique({
    where: { id: input.connectionId },
    include: { company: { select: { id: true, organizationId: true } } },
  });
  if (
    !conn ||
    conn.company.id !== input.companyId ||
    conn.company.organizationId !== input.organizationId
  ) {
    throw notFound("Payroll connection");
  }
  if (conn.status !== "active") {
    throw blockedByPolicy("Cannot create writeback against an inactive connection", {
      status: conn.status,
    });
  }

  // Participant must belong to the same company.
  const participant = await db.participant.findUnique({
    where: { id: input.participantId },
    select: { id: true, companyId: true, status: true, externalEmployeeId: true },
  });
  if (!participant || participant.companyId !== input.companyId) {
    throw notFound("Participant");
  }
  if (!participant.externalEmployeeId) {
    throw blockedByPolicy(
      "Participant has no externalEmployeeId; cannot route writeback to provider",
    );
  }

  // No duplicate active request for the same (connection, participant, type).
  const existing = await db.writebackRequest.findFirst({
    where: {
      payrollConnectionId: input.connectionId,
      participantId: input.participantId,
      requestType: input.requestType,
      status: { in: [...ACTIVE_STATUSES] },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    throw blockedByPolicy(
      `An active writeback for this participant/type already exists (status: ${existing.status})`,
      { existingWritebackId: existing.id },
    );
  }

  return db.$transaction(async (tx) => {
    const wb = await tx.writebackRequest.create({
      data: {
        organizationId: input.organizationId,
        companyId: input.companyId,
        payrollConnectionId: input.connectionId,
        participantId: input.participantId,
        requestType: input.requestType,
        payloadJson: input.payload as unknown as Prisma.InputJsonValue,
        status: "draft",
        createdById: input.actorUserId,
      },
    });
    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.writebackRequestCreated,
        entityType: "writeback_request",
        entityId: wb.id,
        metadata: {
          requestType: input.requestType,
          externalEmployeeId: participant.externalEmployeeId,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
    return { writebackId: wb.id };
  });
}

export type ApproveRequestInput = {
  actorUserId: string;
  organizationId: string;
  writebackId: string;
  approvalNote?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

// Approves + enqueues the writeback job in one transaction. The job will
// flip status to in_flight when it claims the row.
export async function approveWritebackRequest(input: ApproveRequestInput): Promise<void> {
  const wb = await db.writebackRequest.findUnique({
    where: { id: input.writebackId },
  });
  if (!wb || wb.organizationId !== input.organizationId) throw notFound("Writeback request");
  if (wb.status !== "draft") {
    throw blockedByPolicy("Only draft writebacks can be approved", { currentStatus: wb.status });
  }

  // Generate the provider idempotency key here, not in the job handler.
  // If approval is retried before the job lands, the unique constraint on
  // providerRequestId protects against duplicate keys; if the job retries
  // after the row is committed, it reuses the same key.
  const providerRequestId = `nv-wb-${randomUUID()}`;

  await db.$transaction(async (tx) => {
    await tx.writebackRequest.update({
      where: { id: wb.id },
      data: {
        status: "approved",
        approvedById: input.actorUserId,
        approvedAt: new Date(),
        approvalNote: input.approvalNote?.trim() || null,
        providerRequestId,
      },
    });

    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: wb.companyId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.writebackRequestApproved,
        entityType: "writeback_request",
        entityId: wb.id,
        metadata: { providerRequestId },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    await enqueueJob({
      jobType: JOB_TYPES.payrollWriteback,
      payload: { writebackId: wb.id },
      // Re-approving is impossible (status must be draft), so the
      // writeback id itself is a unique-enough idempotency key for the
      // queue.
      idempotencyKey: `writeback:${wb.id}`,
      context: {
        organizationId: input.organizationId,
        companyId: wb.companyId,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
      },
    });
  });
}

export type CancelRequestInput = {
  actorUserId: string;
  organizationId: string;
  writebackId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

// Only draft writebacks can be cancelled — once approved, the job is
// in flight and we don't model "cancel in flight" (it would race with
// the provider call).
export async function cancelWritebackRequest(input: CancelRequestInput): Promise<void> {
  if (!input.reason.trim()) throw validationError("Cancellation reason is required");
  const wb = await db.writebackRequest.findUnique({ where: { id: input.writebackId } });
  if (!wb || wb.organizationId !== input.organizationId) throw notFound("Writeback request");
  if (wb.status !== "draft") {
    throw blockedByPolicy("Only draft writebacks can be cancelled", { currentStatus: wb.status });
  }

  await db.$transaction(async (tx) => {
    await tx.writebackRequest.update({
      where: { id: wb.id },
      data: {
        status: "cancelled",
        cancelledById: input.actorUserId,
        cancelledAt: new Date(),
        cancelReason: input.reason.trim(),
      },
    });
    await writeAudit(
      {
        organizationId: input.organizationId,
        companyId: wb.companyId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.writebackRequestCancelled,
        entityType: "writeback_request",
        entityId: wb.id,
        metadata: { reason: input.reason.trim() },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
}
