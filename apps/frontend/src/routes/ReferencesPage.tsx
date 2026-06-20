import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AddReferenceModal } from '../components/AddReferenceModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { ReferenceCard } from '../components/ReferenceCard';
import { Skeleton } from '../components/Skeleton';
import {
  useDeleteReference,
  useReferences,
} from '../hooks/useReferences';
import { useRoom } from '../hooks/useRoomBrief';
import type { Reference } from '../api/references';

/**
 * F8 references screen — lists every reference attached to a
 * room (GENERATED, EXTERNAL_URL, UPLOADED) with a single "Add
 * reference" entry point and per-card delete with confirmation.
 *
 * Linked from `<RoomDetailPage>`'s "References" section so the
 * deep-link `/rooms/:roomId/references` is a real, navigable
 * surface, not just a placeholder.
 */
export function ReferencesPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const room = useRoom(roomId);
  const refs = useReferences(roomId);
  const del = useDeleteReference(roomId ?? '');
  const [openAdd, setOpenAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Reference | null>(null);

  if (!roomId) return <p className="text-stone-500">No room id in the URL.</p>;

  if (room.isPending || refs.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (room.isError) return <ErrorState error={room.error} onRetry={() => room.refetch()} />;
  if (refs.isError) return <ErrorState error={refs.error} onRetry={() => refs.refetch()} />;

  const items = refs.data?.items ?? [];

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to={`/rooms/${roomId}`}
            className="text-xs uppercase tracking-wider text-stone-400 hover:text-stone-600"
          >
            ← Room
          </Link>
          <h1 className="mt-1 font-display text-display-md font-semibold text-stone-900">
            References
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Inspiration material for this room — past generations, external links, or uploaded
            images. {items.length} attached.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenAdd(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700"
          data-testid="add-reference-button"
        >
          + Add reference
        </button>
      </header>

      {items.length === 0 ? (
        <EmptyReferencesHint onAdd={() => setOpenAdd(true)} />
      ) : (
        <ul
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Reference list"
          data-testid="reference-list"
        >
          {items.map((r) => (
            <li key={r.id}>
              <ReferenceCard reference={r} onDelete={(ref) => setConfirmDelete(ref)} />
            </li>
          ))}
        </ul>
      )}

      <AddReferenceModal open={openAdd} roomId={roomId} onClose={() => setOpenAdd(false)} />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this reference?"
        description="The reference row will be removed. Uploaded files are also deleted from storage when possible."
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onConfirm={() => {
          if (!confirmDelete) return;
          del.mutate(confirmDelete.id, {
            onSettled: () => setConfirmDelete(null),
          });
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </section>
  );
}

function EmptyReferencesHint({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="placeholder-card mx-auto max-w-xl space-y-3 text-center">
      <h2 className="font-display text-2xl font-semibold text-stone-900">No references yet</h2>
      <p className="text-stone-600">
        Add a generation you liked, paste an external link, or upload an image. They appear in the
        room&apos;s export bundle.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700"
      >
        + Add your first reference
      </button>
    </div>
  );
}
