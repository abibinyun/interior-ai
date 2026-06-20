import { useState } from 'react';
import { ApiError } from '../lib/error';
import { useCreateBatch } from '../hooks/useGenerations';
import type { Refinements } from '../api/generations';
import { TextAreaField } from './FormField';

export interface RefinementFormProps {
  roomId: string;
  parentGenerationId: string;
  onCreated?: (batchId: string) => void;
}

const FIELD_DEFS: Array<{ key: keyof Refinements; label: string; placeholder: string }> = [
  {
    key: 'colors',
    label: 'Colors',
    placeholder: 'Deeper greens, less mustard, no bright accents',
  },
  {
    key: 'objects',
    label: 'Objects & decor',
    placeholder: 'Add a large mirror; remove the floor lamp',
  },
  {
    key: 'furniture',
    label: 'Furniture',
    placeholder: 'Swap the sectional for two loveseats',
  },
  {
    key: 'materials',
    label: 'Materials',
    placeholder: 'More walnut, less oak; introduce cane',
  },
  {
    key: 'lighting',
    label: 'Lighting',
    placeholder: 'Warmer, dimmable, fewer downlights',
  },
  {
    key: 'layout',
    label: 'Layout',
    placeholder: 'Open the kitchen to the living area; keep the dining nook',
  },
  {
    key: 'styleEmphasis',
    label: 'Style emphasis',
    placeholder: 'Lean further into japandi; less scandi',
  },
];

/**
 * F5 Refinement form — 7 free-text fields that describe what to
 * change about the parent generation. All optional; the backend
 * appends any provided refinements to the parent prompt when
 * composing the next batch.
 *
 * Posts to `POST /api/rooms/:id/generations` with
 * `parentGenerationId` + `refinements`. On success, calls
 * `onCreated(batchId)` so the parent page can navigate to / open the
 * new batch.
 */
export function RefinementForm({ roomId, parentGenerationId, onCreated }: RefinementFormProps) {
  const initial = FIELD_DEFS.reduce(
    (acc, f) => {
      acc[f.key] = '';
      return acc;
    },
    {} as Record<keyof Refinements, string>,
  );
  const [values, setValues] = useState(initial);
  const createBatch = useCreateBatch(roomId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const refinements = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v.trim().length > 0),
    ) as Refinements;
    createBatch.mutate(
      { parentGenerationId, refinements },
      {
        onSuccess: (b) => onCreated?.(b.batchId),
      },
    );
  };

  const fieldErrors =
    createBatch.error instanceof ApiError && createBatch.error.fields
      ? createBatch.error.fields
      : {};
  const topLevelError =
    createBatch.error && Object.keys(fieldErrors).length === 0 ? createBatch.error : null;

  const hasAnyValue = Object.values(values).some((v) => v.trim().length > 0);

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid="refinement-form"
    >
      <p className="text-sm text-stone-500">
        Tell the AI what to change. Empty fields are ignored. At least one is recommended.
      </p>
      {FIELD_DEFS.map((f) => (
        <TextAreaField
          key={f.key}
          name={`refinement-${f.key}`}
          label={f.label}
          value={values[f.key]}
          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          placeholder={f.placeholder}
          rows={2}
          maxLength={500}
          error={fieldErrors[f.key] ?? null}
        />
      ))}

      {topLevelError ? (
        <p role="alert" className="text-sm text-clay-500">
          {topLevelError.message ?? 'Could not start the refinement.'}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={createBatch.isPending || !hasAnyValue}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
        >
          {createBatch.isPending ? 'Refining…' : 'Refine → 3 new options'}
        </button>
      </div>
    </form>
  );
}