// Per-request audit context propagated via AsyncLocalStorage. Set inside
// requireActor() so any writeAudit() call downstream auto-stamps the
// impersonatedBy field without each call site having to pass it.
//
// This is the "right place" to enrich an audit event with information that
// belongs to the request, not the business operation: who is impersonating,
// what request id correlates the trace, etc. Today we only carry
// impersonatedBy; the shape is designed so adding more fields later is
// non-breaking.
//
// Background-job handlers don't go through requireActor — they read job
// attribution from the BackgroundJob row. If we ever queue jobs while an
// admin is impersonating, the worker should call runWithAuditContext() to
// re-establish the impersonation stamp before invoking the handler.

import { AsyncLocalStorage } from "node:async_hooks";

export type AuditContext = {
  impersonatedBy?: string;
};

const storage = new AsyncLocalStorage<AuditContext>();

// Bind the audit context to the current async chain. Uses enterWith() so the
// rest of the request handler picks it up without a callback wrapper. Safe to
// call multiple times in the same request — the latest call wins, which is
// fine because actor context doesn't change mid-request.
export function setAuditContext(ctx: AuditContext): void {
  storage.enterWith(ctx);
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}

// For tests + worker handlers that want explicit scoping. The fn runs with
// the supplied ctx as its audit context, regardless of any outer context.
export function runWithAuditContext<T>(ctx: AuditContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}
