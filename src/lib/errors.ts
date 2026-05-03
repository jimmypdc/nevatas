// Typed application errors. API handlers convert these into safe JSON responses
// without leaking internals.

export type AppErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "rate_limited"
  | "blocked_by_policy"
  | "internal_error";

const STATUS: Record<AppErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 422,
  conflict: 409,
  rate_limited: 429,
  blocked_by_policy: 409,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function unauthenticated(message = "Authentication required"): AppError {
  return new AppError("unauthenticated", message);
}

export function forbidden(message = "You do not have permission to perform this action"): AppError {
  return new AppError("forbidden", message);
}

export function notFound(entity = "Resource"): AppError {
  return new AppError("not_found", `${entity} not found`);
}

export function validationError(message: string, details?: unknown): AppError {
  return new AppError("validation_error", message, details);
}

export function blockedByPolicy(message: string, details?: unknown): AppError {
  return new AppError("blocked_by_policy", message, details);
}
