import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getProject, type ProjectWithRelations } from '../api/projects';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { formatDate } from '../lib/format';

/**
 * F3 Project detail page.
 *
 * Pulls project + style + rooms via `GET /api/projects/:id`. Now
 * with links into the Style + Rooms editors (F3 deliverable) and
 * action chips for the lifecycle transitions.
 */
export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const query = useQuery<ProjectWithRelations>({
    queryKey: ['projects', projectId],
    queryFn: () => getProject(projectId!),
    enabled: Boolean(projectId),
  });

  if (!projectId) {
    return <p className="text-stone-500">No project id in the URL.</p>;
  }

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const p = query.data;
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <Link
          to="/projects"
          className="text-xs uppercase tracking-wider text-stone-400 hover:text-stone-600"
        >
          ← Projects
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-display-md font-semibold text-stone-900">{p.name}</h1>
          <span
            data-testid="project-status"
            className="rounded-full bg-sand-100 px-3 py-1 text-xs font-medium text-sand-700"
          >
            {p.status}
          </span>
        </div>
        {p.description ? <p className="text-stone-600">{p.description}</p> : null}
        <p className="text-xs text-stone-400">
          Created {formatDate(p.createdAt)}
          {p.completedAt ? ` · Completed ${formatDate(p.completedAt)}` : ''}
        </p>
      </header>

      <section className="placeholder-card space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Style</h2>
          <Link
            to={`/projects/${p.id}/style`}
            className="text-sm font-medium text-forest-500 hover:text-forest-700"
          >
            {p.styleProfile ? 'Edit' : 'Pick a style →'}
          </Link>
        </div>
        {p.styleProfile ? (
          <div className="flex items-baseline gap-3">
            <span className="font-display text-lg">{p.styleProfile.styleKey}</span>
            {p.styleProfile.styleNotes ? (
              <span className="text-sm text-stone-600">{p.styleProfile.styleNotes}</span>
            ) : (
              <span className="text-sm italic text-stone-400">No notes</span>
            )}
          </div>
        ) : (
          <p className="text-sm italic text-stone-400">No style set yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Rooms</h2>
          <Link
            to={`/projects/${p.id}/rooms`}
            className="text-sm font-medium text-forest-500 hover:text-forest-700"
          >
            {p.rooms.length === 0 ? 'Add your first room →' : `Manage (${p.rooms.length})`}
          </Link>
        </div>
        {p.rooms.length === 0 ? (
          <p className="text-sm italic text-stone-400">No rooms yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p.rooms.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-base font-medium">{r.roomType}</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                    {r.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-stone-400">
                  Updated {formatDate(r.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}