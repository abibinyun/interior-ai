import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './error';
import { handle401 } from './session-recovery';

/**
 * Singleton TanStack QueryClient with conservative defaults tuned for
 * the AI-generation UX:
 *
 * - `staleTime: 30s` — most domain data (project list, room list,
 *   style profile) changes slowly; default React Query behavior is too
 *   aggressive for a calm design app.
 * - `retry` is conditional: never retry 4xx (the caller's fault,
 *   retrying won't help) and at most 2 times for 5xx / network
 *   errors (the server's fault, a transient blip may resolve).
 * - `refetchOnWindowFocus: false` — refetching when the user tabs back
 *   is jarring in a design app where the data barely changes.
 * - 401 → schedule a one-shot full-page reload so the backend's
 *   always-issue-on-missing `GET /api/session` re-establishes the
 *   session cookie transparently (F10 hardening).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.isClientError()) return false;
          return failureCount < 2;
        }
        // Unknown error — be conservative and retry once.
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Wire the 401 recovery hook. QueryClient has no native "global
// error handler", so we hang `handle401` off `setMutationDefaults`
// via a per-mutation wrapper is overkill; the simplest reliable
// path is a tiny `queryCache` + `mutationCache` subscription that
// runs after every query/mutation settles.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated' && event.action?.type === 'error' && event.query.state.error) {
    handle401(event.query.state.error);
  }
});
queryClient.getMutationCache().subscribe((event) => {
  if (event.type === 'updated' && event.action?.type === 'error' && event.mutation.state.error) {
    handle401(event.mutation.state.error);
  }
});