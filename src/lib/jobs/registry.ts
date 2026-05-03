// Central job registry. Adding a new job type is a three-step:
//
//   1. Define a stable jobType string in JOB_TYPES below.
//   2. Add a Zod schema for the payload in JOB_PAYLOAD_SCHEMAS so the worker
//      validates inputs at the boundary.
//   3. Register a handler via registerHandler() (typically in a side-effect
//      module imported by lib/jobs/handlers/index.ts).

import { z } from "zod";

import type { JobHandler } from "@/lib/jobs/types";

export const JOB_TYPES = {
  scanFile: "file.scan",
  sendEmail: "email.send",
  // Future:
  //   "validation.run", "contribution_file.generate", "writeback.deferral", ...
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

// Payload schemas. The worker uses these to reject malformed jobs before
// the handler sees them.
export const JOB_PAYLOAD_SCHEMAS = {
  [JOB_TYPES.scanFile]: z.object({
    sourceFileId: z.string().min(1),
  }),
  [JOB_TYPES.sendEmail]: z.object({
    emailMessageId: z.string().min(1),
    replyTo: z.string().nullable().optional(),
  }),
} as const;

const handlers = new Map<JobType, JobHandler<unknown>>();

export function registerHandler<T extends JobType>(
  jobType: T,
  handler: JobHandler<z.infer<(typeof JOB_PAYLOAD_SCHEMAS)[T]>>,
): void {
  handlers.set(jobType, handler as JobHandler<unknown>);
}

export function handlerFor(jobType: string): JobHandler<unknown> | undefined {
  return handlers.get(jobType as JobType);
}

export function knownJobTypes(): JobType[] {
  return Object.values(JOB_TYPES);
}
