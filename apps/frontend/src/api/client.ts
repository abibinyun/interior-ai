import { ApiError, type ErrorCode, type ErrorEnvelopeResponse } from '../lib/error';

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
 * Typed wrapper around `fetch` that:
 *
 * 1. Always sends `credentials: 'include'` so the backend session
 *    cookie (`sid`) is attached.
 * 2. Normalizes non-2xx responses into `ApiError` instances carrying
 *    the envelope's `{ code, message, fields, traceId }`.
 * 3. JSON-encodes the request body when an object is passed and sets
 *    `Content-Type: application/json` automatically.
 * 4. Leaves `FormData` requests alone (used by reference uploads).
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

  if (!response.ok) {
    throw await toApiError(response);
  }

  // 204 No Content — caller doesn't expect a body.
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let envelope: ErrorEnvelopeResponse | null = null;
  try {
    envelope = (await response.json()) as ErrorEnvelopeResponse;
  } catch {
    // Body wasn't JSON. Fall back to status text.
  }
  const code = (envelope?.error?.code ?? 'INTERNAL') as ErrorCode;
  return new ApiError(response.status, code, {
    fields: envelope?.error?.fields,
    traceId: envelope?.error?.traceId,
    message: envelope?.error?.message,
  });
}