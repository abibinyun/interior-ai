import { apiFetch } from './client';

export type ProjectStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ProjectWithRelations extends Project {
  styleProfile: {
    id: string;
    styleKey: string;
    styleNotes: string | null;
  } | null;
  rooms: Array<{
    id: string;
    roomType: string;
    status: string;
    approvedGenerationId: string | null;
    updatedAt: string;
  }>;
}

export function listProjects(): Promise<{ items: Project[] }> {
  return apiFetch<{ items: Project[] }>('/projects');
}

export function getProject(id: string): Promise<ProjectWithRelations> {
  return apiFetch<ProjectWithRelations>(`/projects/${id}`);
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return apiFetch<Project>('/projects', {
    method: 'POST',
    body: input,
  });
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: input,
  });
}

export function completeProject(id: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}/complete`, { method: 'POST' });
}

export function reopenProject(id: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}/reopen`, { method: 'POST' });
}