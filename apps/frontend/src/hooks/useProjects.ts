import { useQuery } from '@tanstack/react-query';
import { listProjects, type Project } from '../api/projects';

export const PROJECTS_QUERY_KEY = ['projects'] as const;

/**
 * Query wrapper around `GET /api/projects`. 30s staleTime matches the
 * global default in `query-client.ts` — projects rarely change
 * spontaneously, so we don't want to re-fetch aggressively.
 */
export function useProjects() {
  return useQuery<{ items: Project[] }>({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: listProjects,
  });
}