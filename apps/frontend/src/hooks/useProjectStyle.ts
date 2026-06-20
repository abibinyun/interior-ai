import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getProjectStyle,
  getStyleCatalog,
  putProjectStyle,
  type ProjectStyle,
  type PutProjectStyleInput,
  type StyleCatalogEntry,
} from '../api/styles';

export const STYLE_CATALOG_QUERY_KEY = ['styles', 'catalog'] as const;
export const projectStyleQueryKey = (projectId: string) =>
  ['projects', projectId, 'style'] as const;

/**
 * Query wrapper around `GET /api/styles` (the curated catalog). Long
 * staleTime — the catalog rarely changes.
 */
export function useStyleCatalog() {
  return useQuery<{ items: StyleCatalogEntry[] }>({
    queryKey: STYLE_CATALOG_QUERY_KEY,
    queryFn: getStyleCatalog,
    staleTime: Infinity,
  });
}

/**
 * Query wrapper around `GET /api/projects/:projectId/style`. Returns
 * `null` when the project has no style set yet (the API normalizes
 * 404 → null in `getProjectStyle`).
 */
export function useProjectStyle(projectId: string | undefined) {
  return useQuery<ProjectStyle | null>({
    queryKey: projectId ? projectStyleQueryKey(projectId) : ['projects', 'no-id', 'style'],
    queryFn: () => getProjectStyle(projectId!),
    enabled: Boolean(projectId),
  });
}

/**
 * Mutation hook for `PUT /api/projects/:projectId/style`. On success,
 * invalidates the project's style query so subsequent reads re-fetch.
 */
export function useSetProjectStyle(projectId: string) {
  const qc = useQueryClient();
  return useMutation<ProjectStyle, Error, PutProjectStyleInput>({
    mutationFn: (input) => putProjectStyle(projectId, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: projectStyleQueryKey(projectId) });
    },
  });
}