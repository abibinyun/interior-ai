import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createProject, type CreateProjectInput, type Project } from '../api/projects';
import { PROJECTS_QUERY_KEY } from './useProjects';

export interface UseCreateProjectInput {
  onSuccess?: (project: Project) => void;
}

/**
 * Mutation hook for `POST /api/projects`. On success, inserts the
 * new project into the cached projects list and navigates the caller
 * can react via `onSuccess` (used to open the modal that follows).
 */
export function useCreateProject({ onSuccess }: UseCreateProjectInput = {}) {
  const qc = useQueryClient();
  return useMutation<Project, Error, CreateProjectInput>({
    mutationFn: (input) => createProject(input),
    onSuccess: async (project) => {
      await qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      onSuccess?.(project);
    },
  });
}