// Postgres-backed job queue.
//
// claimNextJob uses SELECT ... FOR UPDATE SKIP LOCKED so multiple workers
// can drain the queue in parallel without blocking each other on contended
// rows. The transaction is committed before the handler runs so we don't
// hold a row lock for the entire (potentially slow) job.
//
// Failure handling: each job has an attempts counter and maxAttempts cap.
// On retryable failure the worker schedules the next attempt with
// exponential backoff (30s, 2m, 8m, 32m, 2h). On PermanentJobFailure or
// after maxAttempts is reached the job lands in "dead" state for a human
// to inspect.

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import type { JobContext } from "@/lib/jobs/types";

export type EnqueueInput = {
  jobType: string;
  payload: unknown;
  context: JobContext;
  // When set, a second enqueue with the same key returns the existing job.
  // Use a stable per-business-event key (e.g. "scan:<sourceFileId>").
  idempotencyKey?: string;
  maxAttempts?: number;
  // Schedule into the future; defaults to "run as soon as a worker picks it up".
  runAfter?: Date;
};

export type EnqueueResult = {
  id: string;
  jobType: string;
  status: string;
  deduplicated: boolean;
};

// Persists a new job (or returns the existing one if the idempotency key
// matched). Writes a queued audit event.
export async function enqueueJob(input: EnqueueInput): Promise<EnqueueResult> {
  if (input.idempotencyKey) {
    const existing = await db.backgroundJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, jobType: true, status: true },
    });
    if (existing) {
      return { ...existing, deduplicated: true };
    }
  }

  const job = await db.backgroundJob.create({
    data: {
      jobType: input.jobType,
      payloadJson: input.payload as Prisma.InputJsonValue,
      idempotencyKey: input.idempotencyKey,
      maxAttempts: input.maxAttempts ?? 5,
      runAfter: input.runAfter ?? new Date(),
      organizationId: input.context.organizationId,
      companyId: input.context.companyId ?? null,
      actorUserId: input.context.actorUserId ?? null,
      requestId: input.context.requestId ?? null,
    },
  });

  await writeAudit({
    organizationId: input.context.organizationId,
    companyId: input.context.companyId ?? undefined,
    actorUserId: input.context.actorUserId ?? undefined,
    action: AUDIT_ACTIONS.jobEnqueued,
    entityType: "background_job",
    entityId: job.id,
    metadata: { jobType: input.jobType, idempotencyKey: input.idempotencyKey },
    requestId: input.context.requestId ?? undefined,
  });

  return { id: job.id, jobType: job.jobType, status: job.status, deduplicated: false };
}

export type ClaimedJob = {
  id: string;
  jobType: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  context: JobContext;
};

// Atomically claims the oldest eligible job. Returns null when nothing is
// ready. Safe to call concurrently from multiple workers.
export async function claimNextJob(): Promise<ClaimedJob | null> {
  return db.$transaction(async (tx) => {
    const candidates = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT "id" FROM "BackgroundJob"
        WHERE "status" = 'queued' AND "runAfter" <= now()
        ORDER BY "runAfter" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `,
    );
    const id = candidates[0]?.id;
    if (!id) return null;

    const claimed = await tx.backgroundJob.update({
      where: { id },
      data: {
        status: "running",
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    return {
      id: claimed.id,
      jobType: claimed.jobType,
      payload: claimed.payloadJson,
      attempts: claimed.attempts,
      maxAttempts: claimed.maxAttempts,
      context: {
        organizationId: claimed.organizationId,
        companyId: claimed.companyId,
        actorUserId: claimed.actorUserId,
        requestId: claimed.requestId,
      },
    };
  });
}

export async function reportSuccess(jobId: string): Promise<void> {
  const job = await db.backgroundJob.update({
    where: { id: jobId },
    data: { status: "succeeded", completedAt: new Date(), errorMessage: null },
  });
  await writeAudit({
    organizationId: job.organizationId,
    companyId: job.companyId ?? undefined,
    actorUserId: job.actorUserId ?? undefined,
    action: AUDIT_ACTIONS.jobSucceeded,
    entityType: "background_job",
    entityId: job.id,
    metadata: { jobType: job.jobType, attempts: job.attempts },
    requestId: job.requestId ?? undefined,
  });
}

export async function reportFailure(
  jobId: string,
  err: unknown,
  permanent: boolean,
): Promise<{ status: "failed" | "dead" }> {
  const message = err instanceof Error ? err.message : String(err);
  const current = await db.backgroundJob.findUniqueOrThrow({ where: { id: jobId } });

  const isDead = permanent || current.attempts >= current.maxAttempts;
  const nextStatus = isDead ? "dead" : "failed";
  const nextRunAfter = isDead ? current.runAfter : nextBackoff(current.attempts);

  const updated = await db.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: isDead ? "dead" : "queued",
      runAfter: nextRunAfter,
      errorMessage: message.slice(0, 4000),
      completedAt: isDead ? new Date() : null,
    },
  });

  await writeAudit({
    organizationId: updated.organizationId,
    companyId: updated.companyId ?? undefined,
    actorUserId: updated.actorUserId ?? undefined,
    action: isDead ? AUDIT_ACTIONS.jobDead : AUDIT_ACTIONS.jobFailed,
    entityType: "background_job",
    entityId: updated.id,
    metadata: {
      jobType: updated.jobType,
      attempts: updated.attempts,
      maxAttempts: updated.maxAttempts,
      errorMessage: message.slice(0, 1000),
      nextRunAfter: isDead ? null : nextRunAfter.toISOString(),
    },
    requestId: updated.requestId ?? undefined,
  });

  return { status: nextStatus };
}

// 30s, 2m, 8m, 32m, 2h. Caps at the max so attempts past 5 still schedule
// at 2h windows rather than ballooning into days.
export function nextBackoff(attempts: number): Date {
  const base = 30 * 1000; // 30s
  const max = 2 * 3600 * 1000; // 2h
  const delay = Math.min(max, base * Math.pow(4, attempts - 1));
  return new Date(Date.now() + delay);
}
