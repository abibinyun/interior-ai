import { ErrorState } from '../components/ErrorState';
import { ProjectCard } from '../components/ProjectCard';
import { SkeletonList } from '../components/Skeleton';
import { useProjects } from '../hooks/useProjects';

/**
 * F2 Projects page.
 *
 * States:
 *  - pending  → skeleton list (3 placeholder rows)
 *  - error    → friendly error card with trace id + retry
 *  - empty    → first-time visitor empty state
 *  - data     → grid of `ProjectCard`s
 *
 * No creation flow yet (F3). The "Create Project" button is present
 * but inert for F2 (the spec calls for it to be visible).
 */
export function ProjectsPage() {
  const query = useProjects();

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md font-semibold text-stone-900">Projects</h1>
          <p className="mt-1 text-sm text-stone-500">
            One project per house or room set. You can have as many as you want.
          </p>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 opacity-60"
          title="Create flow lands in F3"
        >
          + Create project
        </button>
      </header>

      {query.isPending ? (
        <SkeletonList rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyProjectsHint />
      ) : (
        <ul
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Project list"
          data-testid="projects-list"
        >
          {query.data.items.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyProjectsHint() {
  return (
    <div className="placeholder-card mx-auto max-w-xl space-y-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cream-100 font-display text-2xl text-stone-700">
        ✶
      </div>
      <h2 className="font-display text-2xl font-semibold text-stone-900">
        Your first project starts here
      </h2>
      <p className="text-stone-600">
        Pick a style, brief each room, generate three options at a time, approve what you love,
        and download a complete design pack when you’re done.
      </p>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 opacity-60"
        title="Create flow lands in F3"
      >
        + Create your first project
      </button>
      <p className="text-xs text-stone-400">The Create button activates in milestone F3.</p>
    </div>
  );
}