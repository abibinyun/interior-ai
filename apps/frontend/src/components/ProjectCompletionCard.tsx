import { Link } from 'react-router-dom';
import { ErrorState } from './ErrorState';
import { useCompleteProject, useReopenProject, countRoomStatuses } from '../hooks/useProjectLifecycle';
import type { ProjectWithRelations } from '../api/projects';

export interface ProjectCompletionCardProps {
  project: ProjectWithRelations;
}

/**
 * F9 "lifecycle" card. Renders one of three states:
 *  - **DRAFT / IN_PROGRESS** with not-all-approved → "X of N
 *    rooms approved" + disabled "Mark House Complete" CTA. The
 *    CTA is disabled at the UI level as a courtesy; the backend
 *    is the source of truth (E-01).
 *  - **IN_PROGRESS** with all rooms approved → enabled "Mark
 *    House Complete" CTA. On success the project flips to
 *    COMPLETED and an "Open exports →" link appears.
 *  - **COMPLETED** → "Completed on …" + a "Reopen project"
 *    secondary action so the user can keep iterating. An
 *    "Open exports →" primary link is always visible.
 */
export function ProjectCompletionCard({ project }: ProjectCompletionCardProps) {
  const complete = useCompleteProject(project.id);
  const reopen = useReopenProject(project.id);
  const { total, approved } = countRoomStatuses(project);
  const allApproved = total > 0 && approved === total;
  const isCompleted = project.status === 'COMPLETED';

  const handleComplete = () => {
    complete.mutate(undefined, {
      onError: () => {
        /* ErrorState below picks up `complete.error` */
      },
    });
  };
  const handleReopen = () => {
    reopen.mutate(undefined, {
      onError: () => {
        /* ErrorState below picks up `reopen.error` */
      },
    });
  };

  return (
    <section
      data-testid="project-completion-card"
      className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-stone-900">
          {isCompleted ? 'Project complete' : 'Mark house complete'}
        </h2>
        <span className="text-xs text-stone-500" data-testid="completion-counts">
          {approved} of {total} rooms approved
        </span>
      </header>

      {isCompleted ? (
        <p className="text-sm text-stone-600">
          Completed
          {project.completedAt ? ` on ${new Date(project.completedAt).toLocaleString()}` : ''}.
          Bundle your approved rooms into a downloadable ZIP, or reopen to keep iterating.
        </p>
      ) : allApproved ? (
        <p className="text-sm text-stone-600">
          Every room is approved. You can package this project as a single ZIP bundle now.
        </p>
      ) : (
        <p className="text-sm text-stone-600">
          Approve every room first, then you can mark the house complete and export the bundle.
        </p>
      )}

      {complete.isError ? (
        <div className="mt-3">
          <ErrorState error={complete.error} onRetry={handleComplete} />
        </div>
      ) : null}
      {reopen.isError ? (
        <div className="mt-3">
          <ErrorState error={reopen.error} onRetry={handleReopen} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isCompleted ? (
          <>
            <Link
              to={`/projects/${project.id}/exports`}
              className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700"
              data-testid="open-exports-button"
            >
              Open exports →
            </Link>
            <button
              type="button"
              onClick={handleReopen}
              disabled={reopen.isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
              data-testid="reopen-project-button"
            >
              {reopen.isPending ? 'Reopening…' : 'Reopen project'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleComplete}
            disabled={!allApproved || complete.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-forest-500 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-500/90 disabled:opacity-50"
            data-testid="mark-complete-button"
          >
            {complete.isPending ? 'Marking…' : 'Mark house complete'}
          </button>
        )}
      </div>
    </section>
  );
}
