/**
 * Domain-level error type for the frontend.
 *
 * Mirrors the backend's standardized error envelope (see
 * `docs/05-api-contract.md §2` and `apps/backend/src/common/errors.ts`).
 * Every non-2xx response from the backend is normalized into an
 * `ApiError` so the rest of the UI can branch on `.code`, `.status`,
 * or `.fields` without juggling raw `Response` objects.
 *
 * Conventions:
 * - `.code` is the stable, machine-readable contract code.
 * - `.status` is the HTTP status (mirrors backend envelope).
 * - `.fields` is a `{ path: humanMessage }` map populated by the
 *   backend's `ValidationPipe` for `VALIDATION_FAILED` (400).
 * - `.traceId` is the request id from the backend; surfaces to the UI
 *   so users can quote it when reporting issues.
 * - `.retryAfter` is set for `RATE_LIMITED` (429) responses: the
 *   number of seconds the client should wait before retrying
 *   (mirrors the backend's `Retry-After` header). Lets the UI
 *   show "retrying in N seconds" and back off polling automatically.
 * - `.rateLimit` carries the de-facto `RateLimit-*` advisory headers
 *   the backend now emits on every limited endpoint (Limit /
 *   Remaining / Reset). Useful for proactive self-pacing without
 *   hitting the wall first.
 */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'PROMPT_INVALID'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATION'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_BROKEN'
  | 'STORAGE_FAILED'
  | 'UPLOAD_REJECTED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ErrorEnvelopeResponse {
  error: {
    code: ErrorCode | string;
    message: string;
    traceId?: string;
    fields?: Record<string, string>;
  };
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  /** Seconds until the bucket resets. */
  resetInSeconds: number;
}

export interface ApiErrorInit {
  fields?: Record<string, string>;
  traceId?: string;
  message?: string;
  /** Seconds until the client may retry (set on 429 RATE_LIMITED). */
  retryAfter?: number;
  /** Backend RateLimit-* headers, when present. */
  rateLimit?: RateLimitInfo;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly fields?: Record<string, string>;
  public readonly traceId?: string;
  public readonly retryAfter?: number;
  public readonly rateLimit?: RateLimitInfo;

  constructor(status: number, code: ErrorCode, options?: ApiErrorInit) {
    super(options?.message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = options?.fields;
    this.traceId = options?.traceId;
    this.retryAfter = options?.retryAfter;
    this.rateLimit = options?.rateLimit;
  }

  /** True for HTTP 4xx (caller's fault) — don't retry. */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** True for HTTP 5xx (server's fault) — TanStack Query should retry. */
  isServerError(): boolean {
    return this.status >= 500;
  }

  /** True for HTTP 429 — caller should back off and retry later. */
  isRateLimited(): boolean {
    return this.status === 429;
  }
}