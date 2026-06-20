import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../lib/error';
import { friendlyErrorMessage } from '../lib/error-messages';
import { useProject } from '../hooks/useProject';
import {
  useProjectStyle,
  useSetProjectStyle,
  useStyleCatalog,
} from '../hooks/useProjectStyle';
import { TextAreaField } from '../components/FormField';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';

/**
 * F3 Style page — pick a style from the catalog, optionally add
 * notes, and persist via `PUT /api/projects/:projectId/style`.
 *
 * Reads:
 *  - GET /api/styles (catalog)
 *  - GET /api/projects/:id (project name + status for header)
 *  - GET /api/projects/:id/style (current selection)
 *
 * Writes:
 *  - PUT /api/projects/:id/style with { styleKey, styleNotes }
 */
export function StylePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const catalog = useStyleCatalog();
  const current = useProjectStyle(projectId);
  const setStyle = useSetProjectStyle(projectId ?? '');

  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [styleChanged, setStyleChanged] = useState(false);

  // Seed the form from the current style once it loads.
  useEffect(() => {
    if (current.data) {
      setSelected(current.data.styleKey);
      setNotes(current.data.styleNotes ?? '');
    }
  }, [current.data]);

  // After a successful save, the mutation response carries the SCA-04
  // meta block. We surface the post-save warning banner so the user
  // sees the confirmation even after navigating back to the form.
  useEffect(() => {
    const data = setStyle.data;
    if (data && data.meta.styleChangeWarning) {
      setStyleChanged(true);
    }
  }, [setStyle.data]);

  // Dismiss the post-save banner if the user picks a different style.
  useEffect(() => {
    setStyleChanged(false);
  }, [selected]);

  if (!projectId) return <p className="text-stone-500">No project id in the URL.</p>;

  if (project.isPending || catalog.isPending || current.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />;
  if (catalog.isError) return <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />;
  if (current.isError) return <ErrorState error={current.error} onRetry={() => current.refetch()} />;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setStyle.mutate(
      {
        styleKey: selected,
        styleNotes: notes.trim() ? notes.trim() : null,
      },
      {
        onSuccess: () => current.refetch(),
      },
    );
  };

  const errorFields =
    setStyle.error instanceof ApiError && setStyle.error.fields ? setStyle.error.fields : {};

  const approvedRoomCount = project.data.rooms.filter((r) => r.status === 'APPROVED').length;
  const willWarnOnSave =
    approvedRoomCount > 0 && selected !== null && selected !== current.data?.styleKey;
  const postSaveWarning = styleChanged && setStyle.data?.meta.styleChangeWarning;

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <Link
          to={`/projects/${projectId}`}
          className="text-xs uppercase tracking-wider text-stone-400 hover:text-stone-600"
        >
          ← {project.data.name}
        </Link>
        <h1 className="font-display text-display-md font-semibold text-stone-900">Style</h1>
        <p className="text-stone-600">
          Pick a house-wide design language. Every room you generate will carry this style forward.
        </p>
      </header>

      {postSaveWarning ? (
        <aside
          role="status"
          data-testid="style-change-warning-postsave"
          className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 text-sm text-amber-900 shadow-sm"
        >
          <strong className="font-semibold">Heads up.</strong> Changing project style will NOT
          retroactively modify approved rooms. Only future generations and rooms will use the new
          style profile.
        </aside>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-stone-800">Style catalog</legend>
          <div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            role="radiogroup"
            aria-label="Style catalog"
          >
            {catalog.data.items.map((entry) => {
              const isSelected = selected === entry.key;
              return (
                <label
                  key={entry.key}
                  className={`group cursor-pointer rounded-2xl border p-4 shadow-sm transition ${
                    isSelected
                      ? 'border-forest-500 bg-forest-500/5 ring-2 ring-forest-500/30'
                      : 'border-stone-100 bg-white hover:border-stone-200 hover:shadow-md'
                  }`}
                >
                  <input
                    type="radio"
                    name="styleKey"
                    value={entry.key}
                    checked={isSelected}
                    onChange={() => setSelected(entry.key)}
                    className="sr-only"
                    data-testid={`style-option-${entry.key}`}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-base font-semibold text-stone-900">
                      {entry.name}
                    </span>
                    {isSelected ? (
                      <span aria-hidden="true" className="text-forest-500">✓</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-stone-600">{entry.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {entry.colorTendencies.slice(0, 3).map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </label>
              );
            })}
          </div>
          {errorFields.styleKey ? (
            <p className="mt-2 text-xs text-clay-500">{errorFields.styleKey}</p>
          ) : null}
        </fieldset>

        {willWarnOnSave ? (
          <aside
            role="status"
            data-testid="style-change-warning-presave"
            className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 text-sm text-amber-900 shadow-sm"
          >
            <strong className="font-semibold">Heads up.</strong> You have{' '}
            <span data-testid="approved-room-count">{approvedRoomCount}</span> approved room
            {approvedRoomCount === 1 ? '' : 's'}. Changing the style does NOT retroactively
            re-style them — only future generations will use the new style profile.
          </aside>
        ) : null}

        <TextAreaField
          label="Notes (optional)"
          name="styleNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything specific you'd like the AI to lean into: 'Use warm woods, no brass.' "
          helper="These notes are prepended to every generated prompt for this project."
        />

        {setStyle.error && Object.keys(errorFields).length === 0 ? (
          <p role="alert" className="text-sm text-clay-500">
            {friendlyErrorMessage(setStyle.error)}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          {current.data ? (
            <span className="text-xs text-stone-400">
              Last updated {new Date(current.data.updatedAt).toLocaleString()}
            </span>
          ) : null}
          <button
            type="submit"
            disabled={
              setStyle.isPending ||
              !selected ||
              (selected === current.data?.styleKey && notes === (current.data?.styleNotes ?? ''))
            }
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
            data-testid="style-save-button"
          >
            {setStyle.isPending ? 'Saving…' : current.data ? 'Update style' : 'Save style'}
          </button>
        </div>
      </form>
    </article>
  );
}