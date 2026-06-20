import { useQuery } from '@tanstack/react-query';
import { getProject, type ProjectWithRelations } from '../api/projects';

export const projectQueryKey = (projectId: string) => ['projects', projectId] as const;

export function useProject(projectId: string | undefined) {
  return useQuery<ProjectWithRelations>({
    queryKey: projectId ? projectQueryKey(projectId) : ['projects', 'no-id'],
    queryFn: () => getProject(projectId!),
    enabled: Boolean(projectId),
  });
}