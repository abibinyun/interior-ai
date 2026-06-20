import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './error';

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