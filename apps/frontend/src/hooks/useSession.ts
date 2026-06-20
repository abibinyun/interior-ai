import { useQuery } from '@tanstack/react-query';
import { getSession, type SessionResponse } from '../api/session';

export const SESSION_QUERY_KEY = ['session'] as const;

/**
 * Single-session root query. The backend always returns a session
 * (creating one if none exists in the cookie), so this never fails
 * with a 4xx — we set `retry: false` so transient network blips
 * surface as an error to the UI rather than spamming retries.
 */
export function useSession() {
  return useQuery<SessionResponse>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: getSession,
    retry: false,
    staleTime: Infinity,
  });
}