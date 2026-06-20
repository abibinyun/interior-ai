import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approve,
  createBatch,
  getBatch,
  listGenerationsByRoom,
  reopen,
  type BatchResponse,
  type CreateBatchInput,
  type Generation,
} from '../api/generations';
import { roomQueryKey } from './useRoomBrief';

export const generationsByRoomQueryKey = (roomId: string) =>
  ['rooms', roomId, 'generations'] as const;
export const batchQueryKey = (roomId: string, batchId: string) =>
  ['rooms', roomId, 'generations', 'batches', batchId] as const;

/**
 * Query wrapper around `GET /api/rooms/:id/generations`. Returns the
 * last ~50 generations for the room (the backend caps the list).
 */
export function useGenerationsByRoom(roomId: string | undefined) {
  return useQuery<{ items: Generation[] }>({
    queryKey: roomId ? generationsByRoomQueryKey(roomId) : ['rooms', 'no-id', 'generations'],
    queryFn: () => listGenerationsByRoom(roomId!),
    enabled: Boolean(roomId),
  });
}

/**
 * Query wrapper around `GET /api/rooms/:id/generations/batches/:batchId`.
 * When `pollWhile` is true, the query auto-refreshes every 2s until
 * the batch has at least one PENDING or PROCESSING row. This is the
 * "watch the generations finish" polling the UI needs.
 */
export function useBatchStatus(
  roomId: string | undefined,
  batchId: string | undefined,
  options?: { pollWhile?: boolean },
) {
  const pollWhile = options?.pollWhile ?? true;
  return useQuery<BatchResponse>({
    queryKey:
      roomId && batchId ? batchQueryKey(roomId, batchId) : ['rooms', 'no-id', 'batches', 'no-id'],
    queryFn: () => getBatch(roomId!, batchId!),
    enabled: Boolean(roomId && batchId),
    refetchInterval: (query) => {
      if (!pollWhile) return false;
      const data = query.state.data;
      if (!data) return 2000;
      const allDone = data.items.every((g) => g.status === 'COMPLETED' || g.status === 'FAILED');
      return allDone ? false : 2000;
    },
    refetchIntervalInBackground: false,
  });
}

/**
 * Mutation hook for `POST /api/rooms/:id/generations`. On success,
 * invalidates the room's generations list and seeds the batch query
 * cache with the returned batch. Returns the `BatchResponse` so the
 * caller can navigate to /generate the batch view.
 */
export function useCreateBatch(roomId: string) {
  const qc = useQueryClient();
  return useMutation<BatchResponse, Error, CreateBatchInput>({
    mutationFn: (input) => createBatch(roomId, input),
    onSuccess: async (batch) => {
      await qc.invalidateQueries({ queryKey: generationsByRoomQueryKey(roomId) });
      qc.setQueryData(batchQueryKey(roomId, batch.batchId), batch);
    },
  });
}

/**
 * Mutation hook for `POST /api/rooms/:id/approval { generationId }`.
 * On success, invalidates the room query (status flips to APPROVED)
 * and the generations list (the approved row's status may surface).
 */
export function useApproveGeneration(roomId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { generationId: string }>({
    mutationFn: (input) => approve(roomId, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: roomQueryKey(roomId) });
      await qc.invalidateQueries({ queryKey: generationsByRoomQueryKey(roomId) });
    },
  });
}

/**
 * Mutation hook for `POST /api/rooms/:id/reopen`. Invalidates the
 * room query so the UI re-reads the cleared approval.
 */
export function useReopenRoom(roomId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: () => reopen(roomId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: roomQueryKey(roomId) });
      await qc.invalidateQueries({ queryKey: generationsByRoomQueryKey(roomId) });
    },
  });
}