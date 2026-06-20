import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BundleCard } from '../components/BundleCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { useCreateExport, useExports } from '../hooks/useExports';
import { useProject } from '../hooks/useProject';

/**
 * F9 exports page at `/projects/:projectId/exports`. Lists every
 * bundle newest-first (per M14 ordering) and offers a single
 * "Create bundle" CTA. The CTA is disabled when the project is not
 * COMPLETED (rule E-01) — the backend is the source of truth, so
 * we also surface any `BUSINESS_RULE_VIOLATION` via `<ErrorState />`.
 */
export function ExportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const exports = useExports(projectId);
  const create = useCreateExport(projectId ?? '');
  const [confirmCreate, setConfirmCreate] = useState(false);

  if (!projectId) return <p className="text-stone-500">No project id in the URL.</p>;

  if (project.isPending || exports.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />;
  if (exports.isError)
    return <ErrorState error={exports.error} onRetry={() => exports.refetch()} />;

  const items = exports.data?.items ?? [];
  const canCreate = project.data.status === 'COMPLETED';

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to={`/projects/${projectId}`}
            className="text-xs uppercase tracking-wider text-stone-400 hover:text-stone-600"
          >
            ← {project.data.name}
          </Link>
          <h1 className="mt-1 font-display text-display-md font-semibold text-stone-900">
            Exports
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Versioned ZIP bundles of approved images, prompts, references, and per-room notes.{' '}
            {items.length} bundle{items.length === 1 ? '' : 's'} so far.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmCreate(true)}
          disabled={!canCreate || create.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
          data-testid="create-export-button"
        >
          {create.isPending
            ? 'Packaging…'
            : items.length === 0
              ? 'Create first bundle'
              : 'Create v' + (items[0]!.version + 1)}
        </button>
      </header>

      {!canCreate ? (
        <p
          role="status"
          data-testid="export-disabled-hint"
          className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-600"
        >
          Mark the house complete from the project page first; exports require every room to
          be approved.
        </p>
      ) : null}

      {create.isError ? (
        <ErrorState error={create.error} onRetry={() => setConfirmCreate(true)} />
      ) : null}

      {items.length === 0 ? (
        <EmptyExportsHint onCreate={() => setConfirmCreate(true)} canCreate={canCreate} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="export-list">
          {items.map((b, i) => (
            <li key={b.id}>
              <BundleCard
                bundle={b}
                previewHref={`/exports/${b.id}`}
                isLatest={i === 0}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmCreate}
        title={items.length === 0 ? 'Create the first bundle?' : 'Create a new bundle?'}
        description={
          items.length === 0
            ? 'Packages every approved room, prompt, and reference into a single ZIP. The version becomes v1.'
            : `Packages the project again. The version becomes v${items[0]!.version + 1}. Previous bundles remain available for download.`
        }
        confirmLabel="Package"
        pending={create.isPending}
        onConfirm={() => {
          create.mutate(undefined, {
            onSettled: () => setConfirmCreate(false),
          });
        }}
        onClose={() => setConfirmCreate(false)}
      />
    </section>
  );
}

function EmptyExportsHint({
  onCreate,
  canCreate,
}: {
  onCreate: () => void;
  canCreate: boolean;
}) {
  return (
    <div className="placeholder-card mx-auto max-w-xl space-y-3 text-center">
      <h2 className="font-display text-2xl font-semibold text-stone-900">No bundles yet</h2>
      <p className="text-stone-600">
        Package the project into a single ZIP that contractors can hand to the people actually
        building your house.
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={!canCreate}
        className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
      >
        Create first bundle
      </button>
    </div>
  );
}
