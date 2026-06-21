import { ApiError, type ErrorCode, type ErrorEnvelopeResponse, type RateLimitInfo } from '../lib/error';

/**
 * A JSON-serializable body. Plain objects, arrays, primitives, or
 * `null`. FormData and Blob bodies are passed through without JSON
 * encoding (the browser sets the right Content-Type + boundary).
 *
 * Typed loosely as `unknown` so callers can pass concrete shapes
 * (e.g. `CreateProjectInput`) without TypeScript's nominal-typing
 * blocking structural compatibility with `Record<string, unknown>`.
 */
export type JsonBody =
  | string
  | number
  | boolean
  | null
  | undefined
  | FormData
  | Blob
  | ArrayBuffer
  | unknown;

export interface ApiFetchInit extends Omit<RequestInit, 'body'> {
  body?: JsonBody;
}

/**
 * Parses the de-facto `RateLimit-*` advisory headers into a
 * `RateLimitInfo`. Tolerant of missing / malformed values (returns
 * `undefined` when the headers aren't usable). Header names are
 * case-insensitive in the `Headers` API; we lowercase defensively.
 */
function readRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
  const limitRaw = headers.get('ratelimit-limit') ?? headers.get('x-ratelimit-limit');
  const remainingRaw =
    headers.get('ratelimit-remaining') ?? headers.get('x-ratelimit-remaining');
  const resetRaw = headers.get('ratelimit-reset') ?? headers.get('x-ratelimit-reset');
  if (!limitRaw || !remainingRaw || !resetRaw) return undefined;
  const limit = Number(limitRaw);
  const remaining = Number(remainingRaw);
  const resetInSeconds = Number(resetRaw);
  if (!Number.isFinite(limit) || !Number.isFinite(remaining) || !Number.isFinite(resetInSeconds)) {
    return undefined;
  }
  return { limit, remaining, resetInSeconds };
}

/**
 * Module-level cache of the most recent `RateLimit-*` advisory
 * headers from ANY `/api/*` response. Read by `useBatchStatus` to
 * self-pace polling without round-tripping the server (we already
 * got the answer in the previous response's headers — using it
 * here means we never burn another request just to ask "is the
 * bucket full again?").
 *
 * Per-session, per-tab. Multiple tabs share the same backend bucket
 * (cookie `sid`), so a tab A's polling affects tab B's bucket too.
 * That's correct: if tab A and tab B are both polling, the bucket
 * is shared and both must slow down together.
 *
 * The cache holds the FRESHEST observation — not an aggregate. The
 * polling callback checks `remaining` and slows down if it's low.
 * If the cache is stale (e.g., the last request went to a different
 * rate-limited group), it falls back to the steady-state interval.
 */
let _lastRateLimit: RateLimitInfo | null = null;
let _lastRateLimitAt = 0;

export function getLastRateLimit(): RateLimitInfo | null {
  if (!_lastRateLimit) return null;
  // Stale after 60 s — the bucket may have reset by then, and an
  // old "remaining: 0" reading would cause us to under-poll forever.
  if (Date.now() - _lastRateLimitAt > 60_000) {
    _lastRateLimit = null;
    return null;
  }
  return _lastRateLimit;
}

/** Test-only: clear the rate-limit cache between cases. */
export function __resetRateLimitCacheForTest(): void {
  _lastRateLimit = null;
  _lastRateLimitAt = 0;
}

/**
 * Parses `Retry-After` per RFC 7231 §7.1.3 — the header value is
 * either an integer (seconds) or an HTTP-date. We only consume the
 * integer form (the common case); date-form is ignored so the
 * caller falls back to a safe default.
 */
function readRetryAfterSeconds(headers: Headers): number | undefined {
  const raw = headers.get('retry-after');
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  // Delta-seconds form (the case we emit).
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber;
  // HTTP-date form: not parsed here. Surface as undefined and let
  // the caller use a safe default.
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    const deltaSeconds = Math.max(0, Math.ceil((parsed - Date.now()) / 1000));
    return deltaSeconds;
  }
  return undefined;
}

/**
 * Typed wrapper around `fetch` that:
 *
 * 1. Always sends `credentials: 'include'` so the backend session
 *    cookie (`sid`) is attached.
 * 2. Normalizes non-2xx responses into `ApiError` instances carrying
 *    the envelope's `{ code, message, fields, traceId }`.
 * 3. JSON-encodes the request body when an object is passed and sets
 *    `Content-Type: application/json` automatically.
 * 4. Leaves `FormData` requests alone (used by reference uploads).
 * 5. Captures the `Retry-After` + `RateLimit-*` advisory headers from
 *    the backend (M17) so `useBatchStatus` and friends can pace
 *    themselves without trial-and-error.
 *
 * The base path is `/api` — Vite's dev proxy and the production
 * reverse proxy both forward `/api/*` to the backend.
 */
export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const headers = new Headers(init?.headers);
  let body: BodyInit | null | undefined = init?.body as BodyInit | null | undefined;

  if (body !== undefined && body !== null && !(body instanceof FormData) && !(body instanceof Blob) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    body,
    credentials: 'include',
  });

  // Capture the de-facto `RateLimit-*` advisory headers on EVERY
  // response (success OR error). `useBatchStatus` reads the cache
  // to self-pace polling — see `getLastRateLimit`. We also re-read
  // the headers in `toApiError` so the ApiError carries them.
  const rateLimit = readRateLimitHeaders(response.headers);
  if (rateLimit) {
    _lastRateLimit = rateLimit;
    _lastRateLimitAt = Date.now();
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  // 204 No Content — caller doesn't expect a body.
  if (response.status === 204) {
    return undefined as T;
  }

  // Defensive: some endpoints return 200 OK with an empty body (e.g.
  // `GET /projects/:id/style` when no style has been set yet). The
  // response serializer can also strip a `null` payload in certain
  // code paths. Reading as text first and only JSON-parsing when
  // non-empty avoids `SyntaxError: Unexpected end of JSON input` and
  // returns `undefined` (caller checks via T | undefined) or `null`
  // (caller checks via T | null) consistently.
  const text = await response.text();
  if (text.trim().length === 0) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let envelope: ErrorEnvelopeResponse | null = null;
  try {
    envelope = (await response.json()) as ErrorEnvelopeResponse;
  } catch {
    // Body wasn't JSON. Fall back to status text.
  }
  const code = (envelope?.error?.code ?? 'INTERNAL') as ErrorCode;
  const retryAfter = readRetryAfterSeconds(response.headers);
  const rateLimit = readRateLimitHeaders(response.headers);
  return new ApiError(response.status, code, {
    fields: envelope?.error?.fields,
    traceId: envelope?.error?.traceId,
    message: envelope?.error?.message,
    ...(retryAfter !== undefined ? { retryAfter } : {}),
    ...(rateLimit ? { rateLimit } : {}),
  });
}