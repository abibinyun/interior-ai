import { apiFetch } from './client';

export interface StyleCatalogEntry {
  key: string;
  name: string;
  description: string;
  colorTendencies: string[];
  materialTendencies: string[];
}

export interface ProjectStyle {
  id: string;
  projectId: string;
  styleKey: string;
  styleNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * SCA-04 meta block. Returned alongside the style profile on
 * `PUT /api/projects/:id/style`. `styleChangeWarning` is `true`
 * when the style key was just changed AND at least one room in the
 * project is APPROVED — the existing approved rooms do NOT
 * retroactively re-style (rule SCA-02). The frontend surfaces the
 * warning copy from Q4 in this case.
 */
export interface ProjectStyleMeta {
  styleChangeWarning: boolean;
  approvedRoomCount: number;
}

export interface ProjectStyleSetResponse extends ProjectStyle {
  meta: ProjectStyleMeta;
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
): Promise<ProjectStyleSetResponse> {
  return apiFetch<ProjectStyleSetResponse>(`/projects/${projectId}/style`, {
    method: 'PUT',
    body: input,
  });
}