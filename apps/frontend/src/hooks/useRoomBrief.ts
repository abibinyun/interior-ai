import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRoom, putBrief, type DesignBrief, type PutBriefInput, type Room } from '../api/rooms';

export const roomQueryKey = (roomId: string) => ['rooms', roomId] as const;

/**
 * Query wrapper around `GET /api/rooms/:id`. The room's design
 * brief is included in the response (`designBrief` field, null if
 * never written).
 */
export function useRoom(roomId: string | undefined) {
  return useQuery<Room>({
    queryKey: roomId ? roomQueryKey(roomId) : ['rooms', 'no-id'],
    queryFn: () => getRoom(roomId!),
    enabled: Boolean(roomId),
  });
}

/**
 * Mutation hook for `PUT /api/rooms/:id/brief`. On success,
 * invalidates the room query so the brief shows up in the next read.
 *
 * Per B-03, editing the brief of an APPROVED room transitions it to
 * IN_REVIEW (server-side). The room status pill in the UI updates
 * from this invalidation.
 */
export function useUpdateBrief(roomId: string) {
  const qc = useQueryClient();
  return useMutation<DesignBrief, Error, PutBriefInput>({
    mutationFn: (input) => putBrief(roomId, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: roomQueryKey(roomId) });
    },
  });
}