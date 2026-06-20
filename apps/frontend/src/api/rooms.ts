import { apiFetch } from './client';

export type RoomType =
  | 'LIVING_ROOM'
  | 'DINING_ROOM'
  | 'KITCHEN'
  | 'MASTER_BEDROOM'
  | 'BATHROOM'
  | 'WORKSPACE';

export type RoomStatus =
  | 'BRIEF_DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'GENERATING';

export interface Room {
  id: string;
  projectId: string;
  roomType: RoomType;
  status: RoomStatus;
  approvedGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * The room's design brief, included in `GET /api/rooms/:id`. Null
   * when no brief has been written yet.
   */
  designBrief?: DesignBrief | null;
}

export interface DesignBrief {
  id: string;
  roomId: string;
  purpose: string | null;
  occupants: string | null;
  lightingPreferences: string | null;
  furnitureRequirements: string | null;
  constraints: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listRoomsByProject(projectId: string): Promise<{ items: Room[] }> {
  return apiFetch<{ items: Room[] }>(`/projects/${projectId}/rooms`);
}

export function getRoom(roomId: string): Promise<Room> {
  return apiFetch<Room>(`/rooms/${roomId}`);
}

export function createRoom(projectId: string, roomType: RoomType): Promise<Room> {
  return apiFetch<Room>(`/projects/${projectId}/rooms`, {
    method: 'POST',
    body: { roomType },
  });
}

export interface PutBriefInput {
  purpose?: string;
  occupants?: string;
  lightingPreferences?: string;
  furnitureRequirements?: string;
  constraints?: string;
}

export function putBrief(roomId: string, input: PutBriefInput): Promise<DesignBrief> {
  return apiFetch<DesignBrief>(`/rooms/${roomId}/brief`, {
    method: 'PUT',
    body: input,
  });
}