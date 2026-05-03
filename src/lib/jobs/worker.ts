// Background job worker. The runWorker() loop is shared between the
// standalone worker process (scripts/worker.ts) and the dev-mode in-process
// runner so the same execution semantics apply in both environments.
//
// Each iteration: claim → validate payload against the registered schema →
// invoke the handler → on success report; on throw report failure with
// permanent flag preserved. Between iterations, sleep `idleSleepMs` when no
// job was claimed; otherwise spin immediately to drain bursts.

import { handlerFor, JOB_PAYLOAD_SCHEMAS, type JobType } from "@/lib/jobs/registry";
import { claimNextJob, reportFailure, reportSuccess } from "@/lib/jobs/queue";
import { PermanentJobFailure } from "@/lib/jobs/types";

// Side-effect import: registers handlers in the registry.
import "@/lib/jobs/handlers";

export type WorkerOptions = {
  idleSleepMs?: number;
  // When true, exit after the first idle poll. Useful for one-shot drains
  // in tests or scheduled invocations.
  drainOnce?: boolean;
};

export async function runWorker(opts: WorkerOptions = {}): Promise<void> {
  const idleSleep = opts.idleSleepMs ?? 1_000;

  while (true) {
    const claimed = await claimNextJob();
    if (!claimed) {
      if (opts.drainOnce) return;
      await sleep(idleSleep);
      continue;
    }

    let permanent = false;
    try {
      const schema = JOB_PAYLOAD_SCHEMAS[claimed.jobType as JobType];
      if (!schema) {
        throw new PermanentJobFailure(`Unknown jobType: ${claimed.jobType}`);
      }
      const parsed = schema.safeParse(claimed.payload);
      if (!parsed.success) {
        throw new PermanentJobFailure(
          `Invalid payload for ${claimed.jobType}: ${JSON.stringify(parsed.error.flatten())}`,
        );
      }
      const handler = handlerFor(claimed.jobType);
      if (!handler) {
        throw new PermanentJobFailure(`No handler registered for jobType ${claimed.jobType}`);
      }

      await handler(parsed.data, claimed.context);
      await reportSuccess(claimed.id);
    } catch (err) {
      permanent = err instanceof PermanentJobFailure;
      // Logged for the operator; the audit event is written by reportFailure.
      console.error("[worker] job failed", {
        jobId: claimed.id,
        jobType: claimed.jobType,
        attempt: claimed.attempts,
        permanent,
        err: err instanceof Error ? err.message : String(err),
      });
      await reportFailure(claimed.id, err, permanent);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
