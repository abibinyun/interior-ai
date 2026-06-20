import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { BriefEditor } from '../components/BriefEditor';
import { Skeleton } from '../components/Skeleton';
import { useRoom } from '../hooks/useRoomBrief';
import { useGenerationsByRoom, useReopenRoom } from '../hooks/useGenerations';
import { getGenerationImageUrl } from '../api/generations';

/**
 * F4 Room detail page.
 *
 * - Brief editor (PUT /api/rooms/:id/brief)
 * - Status chip
 * - "Generate 3 options" CTA when brief has content
 * - Recent generations summary
 */
export function RoomDetailPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const room = useRoom(roomId);
  const gens = useGenerationsByRoom(roomId);
  const reopenRoom = useReopenRoom(roomId ?? '');
  const [confirmReopen, setConfirmReopen] = useState(false);

  if (!roomId) return <p className="text-stone-500">No room id in the URL.</p>;
  if (room.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (room.isError) {
    return <ErrorState error={room.error} onRetry={() => room.refetch()} />;
  }

  const r = room.data;
  const hasBrief =
    Boolean(r.designBrief) &&
    Object.values(r.designBrief ?? {}).some((v) => typeof v === 'string' && v.trim().length > 0);

  return (
    <>
    <article className="space-y-8">
      <header className="space-y-2">
        <Link
          to={`/projects/${r.projectId}/rooms`}
          className="text-xs uppercase tracking-wider text-stone-400 hover:text-stone-600"
        >
          ← Rooms
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-display-md font-semibold text-stone-900">
            {humanizeRoomType(r.roomType)}
          </h1>
          <div className="flex items-center gap-2">
            {r.status === 'APPROVED' ? (
              <button
                type="button"
                onClick={() => setConfirmReopen(true)}
                disabled={reopenRoom.isPending}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                data-testid="reopen-room-button"
              >
                {reopenRoom.isPending ? 'Reopening…' : 'Reopen room'}
              </button>
            ) : null}
            <span
              data-testid="room-status"
              className="rounded-full bg-sand-100 px-3 py-1 text-xs font-medium text-sand-700"
            >
              {r.status}
            </span>
          </div>
        </div>
        <p className="text-xs text-stone-400">
          Approved generation: {r.approvedGenerationId ?? 'none'}
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Design brief</h2>
          <span className="text-xs text-stone-400">
            {hasBrief ? 'Complete' : 'Empty — fill in at least one field'}
          </span>
        </div>
        <BriefEditor room={r} />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Generations</h2>
          <Link
            to={`/rooms/${r.id}/generations`}
            className="text-sm font-medium text-forest-500 hover:text-forest-700"
          >
            Open generator →
          </Link>
        </div>
        {gens.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : gens.isError ? (
          <ErrorState error={gens.error} onRetry={() => gens.refetch()} />
        ) : (gens.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm italic text-stone-400">
            No generations yet. {hasBrief ? 'Open the generator to create the first batch.' : ''}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {gens.data!.items.slice(0, 3).map((g) => (
              <li
                key={g.id}
                className="rounded-2xl border border-stone-100 bg-white p-3 shadow-sm"
              >
                <div className="aspect-[4/3] overflow-hidden rounded-lg bg-stone-100">
                  {(() => {
                    const url = getGenerationImageUrl(g);
                    return url ? (
                      <img
                        src={url}
                        alt={`Option ${g.optionIndex}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-stone-400">
                        {g.status}
                      </div>
                    );
                  })()}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
                  <span>Option {g.optionIndex}</span>
                  <span>{g.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>

    <ConfirmDialog
      open={confirmReopen}
      title="Reopen this room?"
      description="The current approval will be cleared and the room will move back to In Review. The generation rows are preserved."
      confirmLabel="Reopen"
      destructive
      pending={reopenRoom.isPending}
      onConfirm={() => {
        reopenRoom.mutate(undefined, {
          onSettled: () => setConfirmReopen(false),
        });
      }}
      onClose={() => setConfirmReopen(false)}
    />
    </>
  );
}

function humanizeRoomType(rt: string): string {
  return rt
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}