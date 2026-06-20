import { Link } from 'react-router-dom';
import type { Project, ProjectStatus } from '../api/projects';
import { formatDate } from '../lib/format';

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

const STATUS_TONE: Record<ProjectStatus, string> = {
  DRAFT: 'bg-stone-100 text-stone-600',
  IN_PROGRESS: 'bg-sand-100 text-sand-700',
  COMPLETED: 'bg-forest-500/10 text-forest-700',
};

/**
 * Visual card for a single project. Used in `ProjectsPage` and (later)
 * in the dashboard / recent activity surface.
 */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="group block rounded-2xl border border-stone-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold text-stone-900 group-hover:text-forest-700">
            {project.name}
          </h3>
          {project.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-stone-600">{project.description}</p>
          ) : (
            <p className="mt-1 text-sm italic text-stone-400">No description</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[project.status]}`}
        >
          {STATUS_LABEL[project.status]}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-stone-400">
        <span>Created {formatDate(project.createdAt)}</span>
        {project.completedAt ? (
          <span>Completed {formatDate(project.completedAt)}</span>
        ) : null}
      </div>
    </Link>
  );
}