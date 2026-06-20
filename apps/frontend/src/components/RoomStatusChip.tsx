import type { RoomStatus } from '../api/rooms';

const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  BRIEF_DRAFT: 'Brief draft',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  GENERATING: 'Generating',
};

const ROOM_STATUS_TONE: Record<RoomStatus, string> = {
  BRIEF_DRAFT: 'bg-stone-100 text-stone-600',
  IN_REVIEW: 'bg-sand-100 text-sand-700',
  APPROVED: 'bg-forest-500/10 text-forest-700',
  GENERATING: 'bg-clay-500/10 text-clay-500',
};

/**
 * Status pill for a room. Mirrors the project status chip in F2 but
 * uses room-specific tones.
 */
export function RoomStatusChip({ status }: { status: RoomStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${ROOM_STATUS_TONE[status]}`}>
      {ROOM_STATUS_LABEL[status]}
    </span>
  );
}