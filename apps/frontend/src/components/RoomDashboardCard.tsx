import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RoomStatus } from '../api/rooms';
import { RoomStatusChip } from './RoomStatusChip';

export interface RoomDashboardCardProps {
  /**
   * The room summary displayed in the card. Uses a wide `string`
   * for `roomType` / `status` so the same card accepts both the
   * strict `Room` payload (from `GET /api/rooms/:id`) and the
   * looser `ProjectWithRelations.rooms[i]` summary (where
   * `status` comes back as a plain string).
   */
  room: {
    id: string;
    roomType: string;
    status: RoomStatus | string;
    approvedGenerationId: string | null;
  };
  /**
   * The owning project's id. Required so the card can build
   * sibling links (e.g. "Design next room →" back to the
   * project's rooms list). The dashboard parent always knows
   * this; we accept it as a prop instead of depending on the
   * backend to echo `projectId` inside every room summary.
   */
  projectId: string;
  /**
   * When true, the card surfaces a "Design next room" CTA that
   * links to the project's rooms list. Used on the project detail
   * dashboard so users with at least one approved room know where
   * to add the next one.
   */
  showDesignNextCta?: boolean;
  /**
   * Optional override for the placeholder image text. Defaults to
   * a humanized version of the room type.
   */
  placeholderLabel?: string;
}

const APPROVED_PROXY_PATH = (id: string): string => `/api/images/generations/${id}`;

function humanizeRoomType(rt: string): string {
  return rt
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * F7 dashboard card for a single room inside a project's
 * cross-room view.
 *
 * Layout:
 *  - Thumbnail (approved generation image via the backend proxy,
 *    or a tinted placeholder with the room type)
 *  - Header: humanized room type + `<RoomStatusChip />`
 *  - Body: status-dependent copy
 *  - Footer: link into the room detail page, plus (when
 *    `showDesignNextCta` is true and the room is APPROVED) a
 *    "Design next room" CTA back to the rooms list.
 *
 * Note: the approved generation is always COMPLETED (per the M12
 * approve rule), so we can safely hit the backend proxy URL
 * without first fetching the generation row. A failed image load
 * falls back to the placeholder via the `onError` handler.
 */
export function RoomDashboardCard({
  room,
  projectId,
  showDesignNextCta,
  placeholderLabel,
}: RoomDashboardCardProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const imageUrl =
    room.approvedGenerationId && !imageBroken
      ? APPROVED_PROXY_PATH(room.approvedGenerationId)
      : null;
  const isApproved = room.status === 'APPROVED';

  return (
    <article
      data-testid={`room-dashboard-card-${room.id}`}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-stone-200 hover:shadow-md ${
        isApproved ? 'border-forest-500/40' : 'border-stone-100'
      }`}
    >
      <Link
        to={`/rooms/${room.id}`}
        aria-label={`Open ${humanizeRoomType(room.roomType)}`}
        className="block"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${humanizeRoomType(room.roomType)} approved design`}
              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
              loading="lazy"
              onError={() => setImageBroken(true)}
            />
          ) : (
            <div
              className="flex h-full items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 text-center text-sm font-medium text-stone-500"
              data-testid="room-dashboard-placeholder"
            >
              {placeholderLabel ?? humanizeRoomType(room.roomType)}
            </div>
          )}
          {isApproved ? (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-forest-500 px-3 py-1 text-xs font-medium text-cream-50 shadow-sm">
              ✓ Approved
            </span>
          ) : null}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-stone-900">
            {humanizeRoomType(room.roomType)}
          </h3>
          <RoomStatusChip status={room.status as RoomStatus} />
        </div>
        <p className="text-xs text-stone-500">{statusCopy(room.status as RoomStatus)}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs">
          <Link
            to={`/rooms/${room.id}`}
            className="font-medium text-forest-500 hover:text-forest-700"
          >
            Open room →
          </Link>
          {showDesignNextCta && isApproved ? (
            <>
              <span className="text-stone-200">·</span>
              <Link
                to={`/projects/${projectId}/rooms`}
                className="font-medium text-stone-700 hover:text-stone-900"
                data-testid={`design-next-room-${room.id}`}
              >
                Design next room →
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function statusCopy(status: RoomStatus): string {
  switch (status) {
    case 'APPROVED':
      return "This room locks the room's design language into the export bundle.";
    case 'IN_REVIEW':
      return 'Generate or refine options, then approve the strongest direction.';
    case 'GENERATING':
      return 'The AI is rendering three options. Usually 10–30 seconds.';
    case 'BRIEF_DRAFT':
    default:
      return 'Write the brief first — purpose, occupants, lighting, furniture, constraints.';
  }
}
