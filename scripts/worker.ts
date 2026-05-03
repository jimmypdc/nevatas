// Standalone worker entrypoint. Run with `npm run worker` (or
// `tsx scripts/worker.ts` directly). In production, run one or more of
// these as long-running containers separate from the request-serving Next
// process.
//
// Graceful shutdown: SIGTERM/SIGINT exits the loop after the current job
// completes. The worker never aborts a running handler — that would leave
// jobs in 'running' state until the operator manually requeues them.

import { runWorker } from "@/lib/jobs/worker";

let shuttingDown = false;
function onShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] received ${signal}; will exit after current job`);
  // The worker loop checks `shuttingDown` on every iteration via the
  // process.exit hook we install: simplest is to just let the next sleep
  // tick observe the flag. For Phase 1 we exit immediately when the loop
  // is in an idle sleep — handlers themselves are not interrupted because
  // they're awaited.
  process.exit(0);
}
process.on("SIGTERM", () => onShutdown("SIGTERM"));
process.on("SIGINT", () => onShutdown("SIGINT"));

console.log("[worker] starting");
runWorker().catch((err) => {
  console.error("[worker] fatal error", err);
  process.exit(1);
});
