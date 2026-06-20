import { apiFetch } from './client';

export type ReferenceSourceType = 'GENERATED' | 'EXTERNAL_URL' | 'UPLOADED';

export interface Reference {
  id: string;
  roomId: string;
  sourceType: ReferenceSourceType;
  sourceId: string | null;
  storageObjectKey: string | null;
  externalUrl: string | null;
  mimeType: string | null;
  byteSize: number | null;
  originalFilename: string | null;
  caption: string | null;
  createdAt: string;
  // Populated only for UPLOADED references on read.
  url?: string;
  urlExpiresAt?: string;
}

export function listReferences(roomId: string): Promise<{ items: Reference[] }> {
  return apiFetch<{ items: Reference[] }>(`/rooms/${roomId}/references`);
}

export interface AddReferenceInput {
  sourceType: ReferenceSourceType;
  sourceId?: string;
  externalUrl?: string;
  caption?: string;
}

export function addReference(roomId: string, input: AddReferenceInput): Promise<Reference> {
  return apiFetch<Reference>(`/rooms/${roomId}/references`, {
    method: 'POST',
    body: input,
  });
}

/**
 * Upload a binary file as an UPLOADED reference. Uses FormData so the
 * browser sets the correct multipart Content-Type with boundary.
 * `apiFetch` detects FormData and skips JSON serialization.
 */
export function uploadReference(
  roomId: string,
  file: File,
  caption?: string,
): Promise<Reference> {
  const form = new FormData();
  form.append('file', file);
  if (caption) form.append('caption', caption);
  return apiFetch<Reference>(`/rooms/${roomId}/references/upload`, {
    method: 'POST',
    body: form,
  });
}

export function deleteReference(referenceId: string): Promise<void> {
  return apiFetch<void>(`/references/${referenceId}`, { method: 'DELETE' });
}