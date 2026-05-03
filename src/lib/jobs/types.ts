// Background job framework. Two pieces:
//
//   - JobHandler<P>  : the function that processes a payload of type P.
//   - JobContext     : the "who/why" carried alongside every job so audit
//                      events written from inside the handler still
//                      attribute back to the user/request that enqueued it.
//
// Handlers should be idempotent: the worker may re-run a job after a crash
// or transient failure, and the same business outcome must result. That's a
// stronger contract than "no double-side-effect" because retried jobs after
// a partial commit must converge.

export type JobContext = {
  organizationId: string;
  companyId?: string | null;
  actorUserId?: string | null;
  requestId?: string | null;
};

export type JobHandler<P> = (payload: P, ctx: JobContext) => Promise<void>;

// Permanent failure. Throw this from a handler to skip retries and route
// straight to the dead state. For business-rule violations that won't
// resolve with backoff (e.g. "source file no longer exists").
export class PermanentJobFailure extends Error {
  readonly permanent = true as const;
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobFailure";
  }
}
