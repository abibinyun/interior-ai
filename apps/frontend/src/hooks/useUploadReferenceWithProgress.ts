import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Reference } from '../api/references';
import { uploadWithProgress } from '../lib/upload';
import { referencesQueryKey } from './useReferences';

export interface UploadProgressState {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * F8 mutation hook for the multipart upload endpoint that exposes
 * live `progress` state (0..100) for the UI. The standard
 * `useUploadReference` uses `apiFetch` (no progress events); use
 * this one when you want a progress bar.
 *
 * Invalidates the references list on success so the new entry
 * shows up with its short-TTL signed URL.
 */
export function useUploadReferenceWithProgress(roomId: string) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<UploadProgressState | null>(null);

  const mutation = useMutation<Reference, Error, { file: File; caption?: string }>({
    mutationFn: ({ file, caption }) =>
      uploadWithProgress<Reference>({
        url: `/api/rooms/${roomId}/references/upload`,
        file,
        ...(caption ? { caption } : {}),
        onProgress: ({ loaded, total }) =>
          setProgress({ loaded, total, percent: total === 0 ? 0 : Math.round((loaded / total) * 100) }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: referencesQueryKey(roomId) });
    },
    onSettled: () => {
      setProgress(null);
    },
  });

  return { ...mutation, progress };
}
