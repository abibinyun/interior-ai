import { ApiError } from './error';

/**
 * Module-level latch to make sure we only auto-refresh once per
 * UNAUTHENTICATED storm. Without this, a query error and a mutation
 * error in the same tick would both trigger a reload.
 */
let sessionReloadScheduled = false;

/**
 * Reset the latch (used by tests + after a successful query
 * re-arms the session).
 */
export function resetSessionReloadLatch(): void {
  sessionReloadScheduled = false;
}

/**
 * Schedule a one-shot full-page reload to recover from a stale or
 * missing session cookie. The backend's `GET /api/session` always
 * issues a fresh session when the cookie is missing, so the
 * reload re-establishes identity transparently.
 *
 * Idempotent: if multiple queries/mutations report 401 in the same
 * tick, only the first schedules a reload; the rest see the latch
 * set and skip.
 */
export function handle401(err: unknown): void {
  if (!(err instanceof ApiError) || err.status !== 401) return;
  if (sessionReloadScheduled) return;
  if (typeof window === 'undefined') return;
  sessionReloadScheduled = true;
  // Defer to next tick so React's error boundary / error UI can
  // render the friendly message first, instead of the page being
  // torn down mid-render.
  setTimeout(() => {
    window.location.reload();
  }, 100);
}
