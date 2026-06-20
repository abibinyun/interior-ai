import type { RoomStatus } from '../api/rooms';

export interface ProjectProgressSummary {
  total: number;
  approved: number;
}

/**
 * Pure helper that summarises an arbitrary list of rooms into the
 * two numbers `<ProjectProgress>` needs. Pulled out into its own
 * file (per react-refresh/only-export-components) so callers
 * (the dashboard, the rooms list, etc.) don't re-implement the
 * status filter.
 */
export function summarizeRoomStatuses(
  rooms: ReadonlyArray<{ status: RoomStatus | string }>,
): ProjectProgressSummary {
  let approved = 0;
  for (const r of rooms) {
    if (r.status === 'APPROVED') approved += 1;
  }
  return { total: rooms.length, approved };
}
