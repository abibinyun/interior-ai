import { apiFetch } from './client';

export interface StyleCatalogEntry {
  styleKey: string;
  name: string;
  description: string;
}

export interface ProjectStyle {
  id: string;
  projectId: string;
  styleKey: string;
  styleNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getStyleCatalog(): Promise<{ items: StyleCatalogEntry[] }> {
  return apiFetch<{ items: StyleCatalogEntry[] }>('/styles');
}

export function getProjectStyle(projectId: string): Promise<ProjectStyle | null> {
  return apiFetch<ProjectStyle | null>(`/projects/${projectId}/style`).catch((err) => {
    // 404 means no style set yet. Surface as `null` to the caller.
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      return null;
    }
    throw err;
  });
}

export interface PutProjectStyleInput {
  styleKey: string;
  styleNotes?: string | null;
}

export function putProjectStyle(
  projectId: string,
  input: PutProjectStyleInput,
): Promise<ProjectStyle> {
  return apiFetch<ProjectStyle>(`/projects/${projectId}/style`, {
    method: 'PUT',
    body: input,
  });
}