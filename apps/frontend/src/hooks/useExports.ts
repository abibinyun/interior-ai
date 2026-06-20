import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExport,
  getExport,
  listExports,
  type ExportBundle,
  type ListedExportBundle,
} from '../api/exports';

export const exportsQueryKey = (projectId: string) =>
  ['projects', projectId, 'exports'] as const;
export const exportBundleQueryKey = (bundleId: string) =>
  ['exports', bundleId] as const;

/**
 * F9 query wrapper around `GET /api/projects/:projectId/exports`.
 * Returns the bundle list newest-first (per M14 ordering).
 */
export function useExports(projectId: string | undefined) {
  return useQuery<{ items: ListedExportBundle[] }>({
    queryKey: projectId ? exportsQueryKey(projectId) : ['projects', 'no-id', 'exports'],
    queryFn: () => listExports(projectId!),
    enabled: Boolean(projectId),
  });
}

/**
 * Mutation hook for `POST /api/projects/:projectId/exports`. On
 * success invalidates the project's exports list and returns the
 * newly created `ExportBundle` (which includes the manifest +
 * short-TTL download URL).
 */
export function useCreateExport(projectId: string) {
  const qc = useQueryClient();
  return useMutation<ExportBundle, Error, void>({
    mutationFn: () => createExport(projectId),
    onSuccess: async (bundle) => {
      await qc.invalidateQueries({ queryKey: exportsQueryKey(projectId) });
      qc.setQueryData(exportBundleQueryKey(bundle.id), bundle);
    },
  });
}

/**
 * Query wrapper around `GET /api/exports/:bundleId`. Re-fetches
 * the manifest + fresh download URL when the user opens the
 * bundle preview page.
 */
export function useExportBundle(bundleId: string | undefined) {
  return useQuery<ExportBundle>({
    queryKey: bundleId ? exportBundleQueryKey(bundleId) : ['exports', 'no-id'],
    queryFn: () => getExport(bundleId!),
    enabled: Boolean(bundleId),
  });
}
