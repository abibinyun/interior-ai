import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoom, getRoom, listRoomsByProject, type Room, type RoomType } from '../api/rooms';
import { PROJECTS_QUERY_KEY } from './useProjects';

export const projectRoomsQueryKey = (projectId: string) =>
  ['projects', projectId, 'rooms'] as const;
export const roomQueryKey = (roomId: string) => ['rooms', roomId] as const;

/**
 * Query wrapper around `GET /api/projects/:projectId/rooms`.
 */
export function useProjectRooms(projectId: string | undefined) {
  return useQuery<{ items: Room[] }>({
    queryKey: projectId ? projectRoomsQueryKey(projectId) : ['projects', 'no-id', 'rooms'],
    queryFn: () => listRoomsByProject(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useRoom(roomId: string | undefined) {
  return useQuery<Room>({
    queryKey: roomId ? roomQueryKey(roomId) : ['rooms', 'no-id'],
    queryFn: () => getRoom(roomId!),
    enabled: Boolean(roomId),
  });
}

/**
 * Mutation hook for `POST /api/projects/:projectId/rooms`. On success,
 * invalidates both the project's rooms list and the parent project's
 * cache so the detail page picks up the new room count.
 */
export function useCreateRoom(projectId: string) {
  const qc = useQueryClient();
  return useMutation<Room, Error, { roomType: RoomType }>({
    mutationFn: (input) => createRoom(projectId, input.roomType),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: projectRoomsQueryKey(projectId) });
      await qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
}