import { useQuery } from '@tanstack/react-query';
import { getLineage, type LineageResponse } from '../api/generations';

export const lineageQueryKey = (generationId: string) =>
  ['generations', generationId, 'lineage'] as const;

/**
 * Query wrapper around `GET /api/generations/:id/lineage`. Used by
 * the generation detail page (and by the lineage tree on the
 * generations page) to render the parent chain.
 */
export function useLineage(generationId: string | undefined) {
  return useQuery<LineageResponse>({
    queryKey: generationId ? lineageQueryKey(generationId) : ['generations', 'no-id', 'lineage'],
    queryFn: () => getLineage(generationId!),
    enabled: Boolean(generationId),
  });
}