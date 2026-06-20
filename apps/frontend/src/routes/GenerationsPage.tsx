import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/error';
import { ErrorState } from '../components/ErrorState';
import { GenerationCard } from '../components/GenerationCard';
import { Skeleton } from '../components/Skeleton';
import { useRoom } from '../hooks/useRoomBrief';
import {
  useApproveGeneration,
  useBatchStatus,
  useCreateBatch,
  useGenerationsByRoom,
} from '../hooks/useGenerations';

/**
 * F4 Generation page.
 *
 * Flow:
 *  1. Read the room to check that a brief has been written (required
 *     to start a batch per M8). Without a brief, show an inline hint.
 *  2. "Generate" button → POST /api/rooms/:id/generations.
 *  3. After creation, store the returned batchId and start polling.
 *  4. Render a 3-card grid; while any row is PENDING/PROCESSING, the
 *     cards pulse and the label says "Generating" (10–30s typical).
 *  5. Once COMPLETED, each card enables an "Approve" button.
 *  6. Approving flips the room to APPROVED and re-renders the grid.
 */
export function GenerationsPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const requestedBatch = searchParams.get('batch');
  const room = useRoom(roomId);
  const list = useGenerationsByRoom(roomId);
  const createBatch = useCreateBatch(roomId ?? '');
  const approveGen = useApproveGeneration(roomId ?? '');
  const [activeBatchId, setActiveBatchId] = useState<string | null>(requestedBatch);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const batch = useBatchStatus(roomId, activeBatchId ?? undefined);

  // Auto-pick the latest batch once generations load (unless the URL
  // already requested a specific batch via ?batch=... — used after a
  // refinement).
  useEffect(() => {
    if (!activeBatchId && list.data?.items.length) {
      const latest = list.data.items[0]!;
      setActiveBatchId(latest.batchId);
    }
    // Once the requested batch loads, drop the ?batch=... param so the
    // URL doesn't keep the refinement target after the user navigates
    // away and back.
    if (requestedBatch && activeBatchId === requestedBatch) {
      const next = new URLSearchParams(searchParams);
      next.delete('batch');
      window.history.replaceState({}, '', `?${next.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBatchId, list.data, requestedBatch]);

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
  if (list.isError) {
    return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  }

  const r = room.data;
  const approvedGenerationId = r.approvedGenerationId ?? null;
  const activeBatch = batch.data;
  const hasBrief =
    Boolean(r.designBrief) &&
    Object.values(r.designBrief ?? {}).some(
      (v) => typeof v === 'string' && v.trim().length > 0,
    );

  const handleGenerate = () => {
    createBatch.mutate(
      {},
      {
        onSuccess: (b) => setActiveBatchId(b.batchId),
      },
    );
  };

  const handleApprove = (generationId: string) => {
    setApprovingId(generationId);
    approveGen.mutate(
      { generationId },
      {
        onSettled: () => setApprovingId(null),
      },
    );
  };

  const approveFieldError =
    approveGen.error instanceof ApiError && approveGen.error.fields
      ? approveGen.error.fields
      : {};

  return (
    <article className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display-md font-semibold text-stone-900">Generate</h1>
          <p className="mt-1 text-sm text-stone-500">
            Three options at a time. Pick the one that feels right.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={createBatch.isPending || !hasBrief || r.status === 'APPROVED'}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
          data-testid="generate-button"
        >
          {createBatch.isPending
            ? 'Starting…'
            : r.status === 'APPROVED'
              ? 'Reopen to generate again'
              : 'Generate 3 options'}
        </button>
      </header>

      {!hasBrief ? (
        <div
          role="status"
          className="placeholder-card max-w-xl space-y-2 border-amber-200 bg-amber-50/40 text-sm text-stone-700"
        >
          <h2 className="font-display text-lg font-semibold text-stone-900">Write the brief first</h2>
          <p>
            The AI needs at least one brief field (purpose, occupants, lighting, furniture, or
            constraints) to generate useful options.
          </p>
        </div>
      ) : null}

      {createBatch.error && Object.keys(approveFieldError).length === 0 ? (
        <ErrorState error={createBatch.error} onRetry={handleGenerate} />
      ) : null}

      {activeBatch ? (
        <section
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Generation options"
          data-testid="generation-grid"
        >
          {activeBatch.items.map((g) => {
            const isApproved = approvedGenerationId === g.id;
            const onApprove =
              !isApproved && g.status === 'COMPLETED' && approvedGenerationId === null
                ? () => handleApprove(g.id)
                : undefined;
            return (
              <GenerationCard
                key={g.id}
                generation={g}
                isApproved={isApproved}
                {...(onApprove ? { onApprove } : {})}
                {...(approvingId === g.id ? { approving: true } : {})}
                refineHref={`/generations/${g.id}?roomId=${g.roomId}`}
              />
            );
          })}
        </section>
      ) : (
        <EmptyGenerationsHint
          onGenerate={handleGenerate}
          canGenerate={hasBrief && r.status !== 'APPROVED'}
        />
      )}

      {approveGen.error && !approveFieldError.generationId ? (
        <ErrorState error={approveGen.error} />
      ) : null}

      {/* Quietly show the historical generations list below the active grid. */}
      {list.data && list.data.items.length > 0 ? (
        <details className="rounded-2xl border border-stone-100 bg-white p-4 text-sm shadow-sm">
          <summary className="cursor-pointer text-stone-700">
            All generations ({list.data.items.length})
          </summary>
          <ul className="mt-3 space-y-1 text-xs text-stone-500">
            {list.data.items.slice(0, 20).map((g) => (
              <li key={g.id} className="flex items-center justify-between">
                <span>
                  Option {g.optionIndex} · {new Date(g.createdAt).toLocaleString()}
                </span>
                <span>
                  {g.status}
                  {g.errorCode ? ` · ${g.errorCode}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function EmptyGenerationsHint({
  onGenerate,
  canGenerate,
}: {
  onGenerate: () => void;
  canGenerate: boolean;
}) {
  return (
    <div className="placeholder-card mx-auto max-w-xl space-y-3 text-center">
      <h2 className="font-display text-2xl font-semibold text-stone-900">No generations yet</h2>
      <p className="text-stone-600">
        Hit Generate to spin up three options. It usually takes 10–30 seconds.
      </p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
      >
        Generate 3 options
      </button>
    </div>
  );
}