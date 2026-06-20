import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../lib/error';
import { friendlyErrorMessage } from '../lib/error-messages';
import { ErrorState } from '../components/ErrorState';
import { LineageTree } from '../components/LineageTree';
import { Modal } from '../components/Modal';
import { RefinementForm } from '../components/RefinementForm';
import { Skeleton } from '../components/Skeleton';
import { useRoom } from '../hooks/useRoomBrief';
import { useLineage } from '../hooks/useLineage';
import { useGenerationsByRoom } from '../hooks/useGenerations';
import { formatDate } from '../lib/format';

/**
 * F5 Generation detail page.
 *
 * Reads a single generation by id (via the room's generations list
 * since the backend doesn't expose a direct GET /api/generations/:id),
 * renders the image + meta, the lineage tree, and a "Refine" CTA
 * that opens the refinement modal.
 */
export function GenerationDetailPage() {
  const { generationId } = useParams<{ generationId: string }>();
  const navigate = useNavigate();

  // The detail page derives the room from the generation. We don't
  // have a direct GET /api/generations/:id, so we list the generations
  // of every room… which is expensive. As a UX shortcut we ask the
  // caller to come from a known room context via a query param.
  // For F5 (single-room projects in practice), we accept this and let
  // F8 polish the navigation.
  const search = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const roomIdFromQuery = search.get('roomId') ?? undefined;

  // We can't read a generation without knowing its room. If the
  // caller came from `/generations/:id` directly without a room
  // query, show a hint.
  const room = useRoom(roomIdFromQuery);
  const generations = useGenerationsByRoom(roomIdFromQuery);
  const lineage = useLineage(generationId);
  const [refineOpen, setRefineOpen] = useState(false);

  if (!generationId) return <p className="text-stone-500">No generation id in the URL.</p>;

  if (!roomIdFromQuery) {
    return (
      <ErrorState
        error={new Error('Open a generation from within a room to see its detail.')}
        title="Missing room context"
      />
    );
  }

  if (room.isPending || generations.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (room.isError) return <ErrorState error={room.error} onRetry={() => room.refetch()} />;
  if (generations.isError)
    return <ErrorState error={generations.error} onRetry={() => generations.refetch()} />;

  const generation = generations.data.items.find((g) => g.id === generationId);

  if (!generation) {
    return (
      <ErrorState
        error={new ApiError(404, 'NOT_FOUND', { message: 'Generation not found in this room.' })}
        title="Generation not found"
      />
    );
  }

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <Link
          to={`/rooms/${generation.roomId}/generations`}
          className="text-xs uppercase tracking-wider text-stone-400 hover:text-stone-600"
        >
          ← Generations
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-display-md font-semibold text-stone-900">
            Option {generation.optionIndex}
          </h1>
          <span
            data-testid="generation-status"
            className="rounded-full bg-sand-100 px-3 py-1 text-xs font-medium text-sand-700"
          >
            {generation.status}
          </span>
        </div>
        <p className="text-xs text-stone-400">
          Created {formatDate(generation.createdAt)} · batch {generation.batchId.slice(0, 8)}
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm">
          <div className="aspect-[4/3] bg-stone-100">
            {generation.imageUrl ? (
              <img
                src={generation.imageUrl}
                alt={`Option ${generation.optionIndex}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">
                {generation.status === 'FAILED'
                  ? generation.errorMessage ?? 'Generation failed'
                  : 'Image pending'}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {lineage.isError ? (
            <ErrorState error={lineage.error} onRetry={() => lineage.refetch()} />
          ) : (
            <LineageTree
              generationId={generation.id}
              currentOptionIndex={generation.optionIndex}
            />
          )}

          {generation.status === 'COMPLETED' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRefineOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700"
              >
                Refine this option
              </button>
              <Link
                to={`/rooms/${generation.roomId}/generations`}
                className="text-sm font-medium text-stone-500 hover:text-stone-900"
              >
                ← Back to options
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <details className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm text-stone-700">Show prompt</summary>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-xs text-stone-700">
{generation.prompt}
        </pre>
      </details>

      <Modal
        open={refineOpen}
        onClose={() => setRefineOpen(false)}
        title="Refine this option"
        description="The AI will generate 3 new options based on your refinements."
      >
        <RefinementForm
          roomId={generation.roomId}
          parentGenerationId={generation.id}
          onCreated={(batchId) => {
            setRefineOpen(false);
            navigate(`/rooms/${generation.roomId}/generations?batch=${batchId}`);
          }}
        />
        {lineage.error ? (
          <p role="alert" className="mt-2 text-sm text-clay-500">
            {friendlyErrorMessage(lineage.error)}
          </p>
        ) : null}
      </Modal>
    </article>
  );
}