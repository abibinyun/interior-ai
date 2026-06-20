import { Link, useParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { useExportBundle } from '../hooks/useExports';
import { formatBytes, formatDateTime } from '../lib/format';

function humanizeRoomType(rt: string): string {
  return rt
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * F9 bundle preview page at `/exports/:bundleId`. Fetches the
 * manifest + short-TTL download URL via `GET /api/exports/:id`
 * and renders a structured view (project + style + per-room file
 * map + full files listing + download CTA).
 */
export function BundlePreviewPage() {
  const { bundleId } = useParams<{ bundleId: string }>();
  const q = useExportBundle(bundleId);

  if (!bundleId) {
    return <p className="text-stone-500">No bundle id in the URL.</p>;
  }

  if (q.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }

  const bundle = q.data;
  const m = bundle.manifest;
  const fileByPath = new Map(m.files.map((f) => [f.path, f] as const));
  const totalBytes = m.files.reduce((acc, f) => acc + f.byteSize, 0);

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <Link
          to={`/projects/${bundle.projectId}/exports`}
          className="text-xs uppercase tracking-wider text-stone-400 hover:text-stone-600"
        >
          ← Exports
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-display-md font-semibold text-stone-900">
            Bundle v{bundle.version}
          </h1>
          <span
            data-testid="bundle-version-badge"
            className="rounded-full bg-sand-100 px-3 py-1 text-xs font-medium text-sand-700"
          >
            {formatBytes(bundle.byteSize)} · generated {formatDateTime(bundle.createdAt)}
          </span>
        </div>
      </header>

      {bundle.downloadUrl ? (
        <a
          href={bundle.downloadUrl}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-medium text-cream-50 hover:bg-stone-700"
          data-testid="bundle-download-link"
        >
          Download bundle (ZIP) ↓
        </a>
      ) : (
        <p className="text-sm italic text-stone-400">
          Download URL not available. Refresh the page to retry.
        </p>
      )}
      {bundle.downloadUrlExpiresAt ? (
        <p className="text-xs text-stone-400">
          Link expires at {formatDateTime(bundle.downloadUrlExpiresAt)}.
        </p>
      ) : null}

      <section className="placeholder-card space-y-3">
        <h2 className="font-display text-xl font-semibold">Project</h2>
        <p className="text-sm text-stone-600">
          <strong className="text-stone-900">{m.project.name}</strong>
          {m.project.description ? ` · ${m.project.description}` : ''}
        </p>
        <p className="text-xs text-stone-500">
          Created {formatDateTime(m.project.createdAt)}
          {m.project.completedAt ? ` · Completed ${formatDateTime(m.project.completedAt)}` : ''}
        </p>
      </section>

      <section className="placeholder-card space-y-3">
        <h2 className="font-display text-xl font-semibold">Style</h2>
        {m.styleProfile ? (
          <p className="text-sm text-stone-700">
            <strong>{m.styleProfile.styleKey}</strong>
            {m.styleProfile.styleNotes ? ` — ${m.styleProfile.styleNotes}` : ''}
          </p>
        ) : (
          <p className="text-sm italic text-stone-400">No style set.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Rooms ({m.rooms.length})</h2>
        <ul className="space-y-2" data-testid="bundle-room-list">
          {m.rooms.map((r) => (
            <li
              key={r.id}
              data-testid={`bundle-room-${r.id}`}
              className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-base font-semibold text-stone-900">
                  {humanizeRoomType(r.roomType)}
                </h3>
                <span className="text-xs text-stone-500">
                  {r.referencesCount} reference{r.referencesCount === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-stone-600">
                {r.approvedImageFile ? (
                  <li className="flex items-center justify-between">
                    <span className="font-mono text-stone-500">
                      approved-images/{r.approvedImageFile}
                    </span>
                    <span className="text-stone-400">
                      {fileByPath.get(`approved-images/${r.approvedImageFile}`)
                        ? formatBytes(fileByPath.get(`approved-images/${r.approvedImageFile}`)!.byteSize)
                        : 'missing'}
                    </span>
                  </li>
                ) : null}
                {r.promptFile ? (
                  <li className="flex items-center justify-between">
                    <span className="font-mono text-stone-500">prompts/{r.promptFile}</span>
                    <span className="text-stone-400">
                      {fileByPath.get(`prompts/${r.promptFile}`)
                        ? formatBytes(fileByPath.get(`prompts/${r.promptFile}`)!.byteSize)
                        : 'missing'}
                    </span>
                  </li>
                ) : null}
                {r.notesFile ? (
                  <li className="flex items-center justify-between">
                    <span className="font-mono text-stone-500">room-notes/{r.notesFile}</span>
                    <span className="text-stone-400">
                      {fileByPath.get(`room-notes/${r.notesFile}`)
                        ? formatBytes(fileByPath.get(`room-notes/${r.notesFile}`)!.byteSize)
                        : 'missing'}
                    </span>
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">
          Files ({m.files.length}) · {formatBytes(totalBytes)}
        </h2>
        <ul className="space-y-1 rounded-2xl border border-stone-100 bg-white p-4 font-mono text-xs text-stone-700 shadow-sm">
          {m.files.map((f) => (
            <li
              key={f.path}
              data-testid={`bundle-file-${f.path}`}
              className="flex items-center justify-between"
            >
              <span className="truncate">{f.path}</span>
              <span className="ml-3 shrink-0 text-stone-400">{formatBytes(f.byteSize)}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
