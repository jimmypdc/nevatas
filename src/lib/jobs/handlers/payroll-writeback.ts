// payroll.writeback job handler. Pulls the approved writeback row, calls
// the provider adapter with the previously-generated providerRequestId
// (so retries are idempotent on the provider side), and records the
// outcome.
//
// Status transitions:
//   approved → in_flight   — at the start of the handler (marks "we
//                            called the provider; outcome unknown")
//   in_flight → succeeded  — adapter returned ProviderWritebackResult
//   in_flight → failed     — adapter threw (after maxAttempts exhausted)
//
// The job queue handles backoff between attempts; we don't model
// per-writeback retry timing.

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { adapterFor } from "@/lib/integrations/registry";
import type {
  PayrollProviderAdapter,
  PayrollProviderName,
  ProviderDeferralUpdate,
  ProviderWritebackResult,
} from "@/lib/integrations/types";
import { PermanentJobFailure } from "@/lib/jobs/types";
import { JOB_TYPES, registerHandler } from "@/lib/jobs/registry";

registerHandler(JOB_TYPES.payrollWriteback, async (payload) => {
  const wb = await db.writebackRequest.findUnique({
    where: { id: payload.writebackId },
    include: {
      participant: { select: { externalEmployeeId: true } },
      payrollConnection: { select: { provider: true, status: true } },
    },
  });
  if (!wb) {
    // Writeback row was deleted between approval and pickup — permanent
    // failure with a clear message rather than a flaky retry loop.
    throw new PermanentJobFailure(`Writeback ${payload.writebackId} not found`);
  }

  if (wb.status === "succeeded" || wb.status === "failed" || wb.status === "cancelled") {
    // Already terminal; nothing to do. (This can happen if the same job
    // was enqueued twice via a different code path; we treat it as a
    // benign no-op.)
    return;
  }
  if (wb.status !== "approved" && wb.status !== "in_flight") {
    throw new PermanentJobFailure(
      `Writeback ${wb.id} is in an unexpected status: ${wb.status}`,
    );
  }
  if (wb.payrollConnection.status !== "active") {
    throw new PermanentJobFailure(
      `Connection ${wb.payrollConnectionId} is no longer active; refusing writeback`,
    );
  }
  if (!wb.providerRequestId) {
    // Shouldn't happen — approveWritebackRequest sets this. Defensive.
    throw new PermanentJobFailure(`Writeback ${wb.id} has no providerRequestId`);
  }
  if (!wb.participant.externalEmployeeId) {
    throw new PermanentJobFailure(
      `Writeback ${wb.id} participant has no externalEmployeeId`,
    );
  }

  // Flip to in_flight + increment attempts in one row update so the
  // dashboard reflects "we're trying" even while the provider call is
  // pending. The job queue has already incremented its own attempts
  // counter when it claimed the row; this is a separate writeback-level
  // counter the operator UI surfaces.
  await db.writebackRequest.update({
    where: { id: wb.id },
    data: {
      status: "in_flight",
      attempts: { increment: 1 },
      submittedAt: wb.submittedAt ?? new Date(),
    },
  });

  await writeAudit({
    organizationId: wb.organizationId,
    companyId: wb.companyId,
    action: AUDIT_ACTIONS.writebackRequestSubmitted,
    entityType: "writeback_request",
    entityId: wb.id,
    metadata: {
      requestType: wb.requestType,
      attemptsSoFar: wb.attempts + 1,
      providerRequestId: wb.providerRequestId,
    },
  });

  const adapter = adapterFor(wb.payrollConnection.provider as PayrollProviderName);

  // Dispatch by requestType. v1 = deferral_election; the switch is
  // designed so adding loan_repayment / eligibility_indicator is just
  // another case with its own adapter call.
  let providerResult: ProviderWritebackResult;
  try {
    switch (wb.requestType) {
      case "deferral_election":
        providerResult = await callDeferralUpdate(adapter, wb);
        break;
      default:
        throw new PermanentJobFailure(`Unknown writeback requestType: ${wb.requestType}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isPermanent =
      err instanceof PermanentJobFailure || wb.attempts + 1 >= wb.maxAttempts;
    await db.writebackRequest.update({
      where: { id: wb.id },
      data: {
        status: isPermanent ? "failed" : "approved", // re-eligible for next retry
        errorMessage: message.slice(0, 4000),
        completedAt: isPermanent ? new Date() : null,
      },
    });
    await writeAudit({
      organizationId: wb.organizationId,
      companyId: wb.companyId,
      action: AUDIT_ACTIONS.writebackRequestFailed,
      entityType: "writeback_request",
      entityId: wb.id,
      metadata: {
        errorMessage: message.slice(0, 1000),
        permanent: isPermanent,
        attempts: wb.attempts + 1,
      },
    });
    // Re-throw so the job queue records the failure and applies backoff.
    throw err;
  }

  await db.writebackRequest.update({
    where: { id: wb.id },
    data: {
      status: "succeeded",
      providerConfirmationId: providerResult.providerConfirmationId ?? null,
      providerResponseJson: providerResult as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
      errorMessage: null,
    },
  });

  await writeAudit({
    organizationId: wb.organizationId,
    companyId: wb.companyId,
    action: AUDIT_ACTIONS.writebackRequestSucceeded,
    entityType: "writeback_request",
    entityId: wb.id,
    metadata: {
      providerConfirmationId: providerResult.providerConfirmationId ?? null,
      effectiveDate: providerResult.effectiveDate.toISOString(),
    },
  });
});

async function callDeferralUpdate(
  adapter: PayrollProviderAdapter,
  wb: {
    id: string;
    payrollConnectionId: string;
    participant: { externalEmployeeId: string | null };
    payloadJson: unknown;
  },
): Promise<ProviderWritebackResult> {
  if (!adapter.updateDeferralElection) {
    throw new PermanentJobFailure(
      `Adapter ${adapter.provider} does not implement updateDeferralElection`,
    );
  }
  const payload = wb.payloadJson as {
    effectiveDate: string;
    preTaxPercent?: number;
    preTaxAmount?: number;
    rothPercent?: number;
    rothAmount?: number;
  };
  const update: ProviderDeferralUpdate = {
    externalEmployeeId: wb.participant.externalEmployeeId!,
    effectiveDate: new Date(payload.effectiveDate),
    preTaxPercent: payload.preTaxPercent,
    preTaxAmount: payload.preTaxAmount,
    rothPercent: payload.rothPercent,
    rothAmount: payload.rothAmount,
  };
  return adapter.updateDeferralElection(wb.payrollConnectionId, update);
}
