import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addReference,
  deleteReference,
  listReferences,
  uploadReference,
  type AddReferenceInput,
  type Reference,
} from '../api/references';

export const referencesQueryKey = (roomId: string) =>
  ['rooms', roomId, 'references'] as const;

/**
 * F8 query wrapper around `GET /api/rooms/:roomId/references`. The
 * list includes both GENERATED, EXTERNAL_URL, and UPLOADED entries;
 * UPLOADED ones carry a short-TTL signed `url` field for thumbnail
 * rendering.
 */
export function useReferences(roomId: string | undefined) {
  return useQuery<{ items: Reference[] }>({
    queryKey: roomId ? referencesQueryKey(roomId) : ['rooms', 'no-id', 'references'],
    queryFn: () => listReferences(roomId!),
    enabled: Boolean(roomId),
  });
}

/**
 * Mutation hook for `POST /api/rooms/:roomId/references` — used by
 * the GENERATED and EXTERNAL_URL flows. UPLOADED must use
 * `useUploadReference` instead (multipart endpoint per ADR-005).
 */
export function useAddReference(roomId: string) {
  const qc = useQueryClient();
  return useMutation<Reference, Error, AddReferenceInput>({
    mutationFn: (input) => addReference(roomId, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: referencesQueryKey(roomId) });
    },
  });
}

/**
 * Mutation hook for `POST /api/rooms/:roomId/references/upload`
 * (multipart). On success invalidates the references list so the
 * new thumbnail (with its short-TTL signed URL) shows up.
 */
export function useUploadReference(roomId: string) {
  const qc = useQueryClient();
  return useMutation<Reference, Error, { file: File; caption?: string }>({
    mutationFn: ({ file, caption }) => uploadReference(roomId, file, caption),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: referencesQueryKey(roomId) });
    },
  });
}

/**
 * Mutation hook for `DELETE /api/references/:id`. Invalidates the
 * room's references list on success.
 */
export function useDeleteReference(roomId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (referenceId) => deleteReference(referenceId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: referencesQueryKey(roomId) });
    },
  });
}
