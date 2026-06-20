import { apiFetch } from './client';

export interface BundleManifestRoomEntry {
  id: string;
  roomType: string;
  status: string;
  approvedGenerationId: string | null;
  approvedImageFile: string | null;
  promptFile: string | null;
  notesFile: string | null;
  referencesCount: number;
}

export interface BundleManifestFileEntry {
  path: string;
  byteSize: number;
}

export interface BundleManifest {
  schemaVersion: number;
  generatedAt: string;
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    createdAt: string;
    completedAt: string | null;
  };
  styleProfile: {
    styleKey: string;
    styleNotes: string | null;
  } | null;
  rooms: BundleManifestRoomEntry[];
  files: BundleManifestFileEntry[];
}

export interface ExportBundle {
  id: string;
  projectId: string;
  version: number;
  byteSize: number;
  createdAt: string;
  manifest: BundleManifest;
  downloadUrl?: string;
  downloadUrlExpiresAt?: string;
}

export interface ListedExportBundle {
  id: string;
  projectId: string;
  version: number;
  byteSize: number;
  createdAt: string;
}

export function createExport(projectId: string): Promise<ExportBundle> {
  return apiFetch<ExportBundle>(`/projects/${projectId}/exports`, { method: 'POST' });
}

export function listExports(projectId: string): Promise<{ items: ListedExportBundle[] }> {
  return apiFetch<{ items: ListedExportBundle[] }>(`/projects/${projectId}/exports`);
}

export function getExport(bundleId: string): Promise<ExportBundle> {
  return apiFetch<ExportBundle>(`/exports/${bundleId}`);
}