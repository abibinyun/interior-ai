import type { Generation } from '../api/generations';
import { GENERATION_STATUS_LABEL, generationErrorTitle } from './generation-status';

export interface GenerationCardProps {
  generation: Generation;
  isApproved: boolean;
  onApprove?: () => void;
  approving?: boolean;
}

/**
 * One cell in the 3-option generation grid.
 *
 * States:
 *  - PENDING / PROCESSING → pulsing skeleton with status text
 *  - COMPLETED → image + approve button (disabled when approved)
 *  - FAILED → friendly error card with the documented code
 *  - isApproved → green "Approved" ribbon + no approve button
 */
export function GenerationCard({ generation, isApproved, onApprove, approving }: GenerationCardProps) {
  if (generation.status === 'FAILED') {
    return (
      <article
        data-testid={`generation-card-${generation.optionIndex}`}
        className="rounded-2xl border border-clay-500/30 bg-clay-500/5 p-5 shadow-sm"
      >
        <header className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-clay-500">
            Option {generation.optionIndex}
          </span>
        </header>
        <h3 className="font-display text-base font-semibold text-stone-900">
          {generationErrorTitle(generation.errorCode)}
        </h3>
        <p className="mt-1 text-sm text-stone-700">{generation.errorMessage ?? 'Generation failed.'}</p>
        <p className="mt-3 text-xs text-stone-400">
          Try generating again — the next batch re-runs the failed option.
        </p>
      </article>
    );
  }

  if (generation.status === 'COMPLETED') {
    return (
      <article
        data-testid={`generation-card-${generation.optionIndex}`}
        className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
          isApproved ? 'border-forest-500 ring-2 ring-forest-500/30' : 'border-stone-100'
        }`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
          {generation.imageUrl ? (
            <img
              src={generation.imageUrl}
              alt={`Generation ${generation.optionIndex}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-stone-400">
              No image
            </div>
          )}
          {isApproved ? (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-forest-500 px-3 py-1 text-xs font-medium text-cream-50">
              ✓ Approved
            </span>
          ) : null}
        </div>
        <footer className="flex items-center justify-between gap-2 px-4 py-3">
          <span className="text-xs text-stone-500">Option {generation.optionIndex}</span>
          {!isApproved ? (
            <button
              type="button"
              onClick={onApprove}
              disabled={approving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
              data-testid={`approve-button-${generation.optionIndex}`}
            >
              {approving ? 'Approving…' : 'Approve'}
            </button>
          ) : null}
        </footer>
      </article>
    );
  }

  // PENDING or PROCESSING
  return (
    <article
      data-testid={`generation-card-${generation.optionIndex}`}
      aria-busy="true"
      className="overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm"
    >
      <div className="aspect-[4/3] animate-pulse bg-stone-100" aria-hidden="true" />
      <div className="space-y-2 px-4 py-3">
        <span className="text-xs text-stone-500">Option {generation.optionIndex}</span>
        <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
          {GENERATION_STATUS_LABEL[generation.status]}
        </p>
      </div>
    </article>
  );
}