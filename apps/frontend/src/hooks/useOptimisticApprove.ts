import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Room } from '../api/rooms';
import { approve, type Generation } from '../api/generations';
import { roomQueryKey } from './useRoomBrief';
import { generationsByRoomQueryKey } from './useGenerations';

/**
 * Approve a generation, with optimistic UI updates + rollback.
 *
 * Flow:
 *  1. `onMutate` — cancel any in-flight room query, snapshot the
 *     previous room, set its `approvedGenerationId` + `status` to the
 *     target generation id + `APPROVED`. Other components (Generation
 *     cards, room status pills) re-render against the optimistic
 *     cache immediately.
 *  2. `mutationFn` — `POST /api/rooms/:roomId/approval`.
 *  3. `onError` — restore the snapshotted room (rollback).
 *  4. `onSettled` — invalidate the room + generations caches so the
 *     server-truth is re-fetched.
 *
 * Why `onSettled` invalidates instead of `onSuccess` writes the cache
 * directly: the server response for the approve endpoint doesn't echo
 * the full room with `updatedAt`, so we let the server re-authority.
 */
export interface ApproveArgs {
  roomId: string;
  generationId: string;
  onErrorToast?: (err: unknown) => void;
}

export function useOptimisticApprove() {
  const qc = useQueryClient();

  return useMutation<Room, Error, ApproveArgs, { previousRoom: Room | undefined }>({
    mutationFn: ({ roomId, generationId }) =>
      approve(roomId, { generationId }).then((r) => {
        // The backend returns the room directly (not wrapped), per the
        // controller's HttpCode.OK + return shape.
        return r;
      }),
    onMutate: async ({ roomId, generationId }) => {
      await qc.cancelQueries({ queryKey: roomQueryKey(roomId) });
      const previousRoom = qc.getQueryData<Room>(roomQueryKey(roomId));
      if (previousRoom) {
        const optimistic: Room = {
          ...previousRoom,
          approvedGenerationId: generationId,
          status: 'APPROVED',
          updatedAt: new Date().toISOString(),
        };
        qc.setQueryData(roomQueryKey(roomId), optimistic);
      }
      return { previousRoom };
    },
    onError: (err, { roomId, onErrorToast }, context) => {
      if (context?.previousRoom) {
        qc.setQueryData(roomQueryKey(roomId), context.previousRoom);
      }
      onErrorToast?.(err);
    },
    onSettled: (_data, _err, { roomId }) => {
      void qc.invalidateQueries({ queryKey: roomQueryKey(roomId) });
      void qc.invalidateQueries({ queryKey: generationsByRoomQueryKey(roomId) });
    },
  });
}

/**
 * Read-only helper used by the GenerationCard to determine whether
 * a generation card is the currently-approved one. Encapsulates the
 * `approvedGenerationId === generation.id` check so the GenerationPage
 * doesn't need to know the room query key.
 */
export function isApprovedGeneration(
  generation: Generation,
  approvedGenerationId: string | null,
): boolean {
  return approvedGenerationId === generation.id;
}