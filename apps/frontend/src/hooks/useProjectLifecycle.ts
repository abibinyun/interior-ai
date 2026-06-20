import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { Project, ProjectWithRelations } from '../api/projects';
import { projectQueryKey } from './useProject';

export const projectLifecycleQueryKey = (projectId: string) =>
  ['projects', projectId, 'lifecycle'] as const;

/**
 * F9 query wrapper around `POST /api/projects/:id/complete`. We
 * wrap the underlying `apiFetch` (which already returns a `Project`
 * object on 200) so the mutation result is typed the same way as
 * the read.
 */
function completeProject(projectId: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}/complete`, { method: 'POST' });
}

function reopenProject(projectId: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}/reopen`, { method: 'POST' });
}

/**
 * Mutation hook for `POST /api/projects/:id/complete`. On success
 * invalidates the project query (status flips to COMPLETED +
 * `completedAt` set) AND the parent projects list (so the
 * `ProjectsPage` reflects the new state).
 *
 * Backend rule E-01: the project must have every room in
 * `APPROVED` status. If the user clicks while any room is still
 * `IN_REVIEW`, the backend returns `422 BUSINESS_RULE_VIOLATION`
 * which surfaces via `<ErrorState />` per the friendly mapper.
 */
export function useCompleteProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation<Project, Error, void>({
    mutationFn: () => completeProject(projectId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: projectQueryKey(projectId) });
      await qc.invalidateQueries({ queryKey: ['projects'] });
      await qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

/**
 * Mutation hook for `POST /api/projects/:id/reopen`. Clears the
 * `completedAt` and flips the project back to `IN_PROGRESS`.
 * Approvals are preserved per the lifecycle rules (rule P-05);
 * the user can re-export later for a v+1 bundle.
 */
export function useReopenProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation<Project, Error, void>({
    mutationFn: () => reopenProject(projectId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: projectQueryKey(projectId) });
      await qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/**
 * Read-only helper used by `<ProjectCompletionCard />` to decide
 * whether the "Mark House Complete" CTA is enabled. Returns the
 * counts so the card can render "N of M approved" inline.
 */
export interface ProjectRoomCounts {
  total: number;
  approved: number;
}

export function countRoomStatuses(
  project: ProjectWithRelations | undefined,
): ProjectRoomCounts {
  if (!project) return { total: 0, approved: 0 };
  let approved = 0;
  for (const r of project.rooms) {
    if (r.status === 'APPROVED') approved += 1;
  }
  return { total: project.rooms.length, approved };
}

// Re-export so other modules can grab the counts helper without
// pulling ProjectWithRelations from two places.
export type { ProjectWithRelations };
// Touch `useQuery` so this file isn't accidentally tree-shaken when
// nothing imports it (it's a co-located helper).
void useQuery;
