import { useStyleCatalog } from '../hooks/useProjectStyle';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';

/**
 * F3 Style Catalog page — browsable grid of the 8 curated styles. From
 * here users can drill into a specific project's style editor. The
 * nav item is "Style catalog"; the per-project editor lives at
 * `/projects/:id/style`.
 */
export function StyleCatalogPage() {
  const catalog = useStyleCatalog();
  if (catalog.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (catalog.isError) {
    return <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />;
  }
  return (
    <article className="space-y-6">
      <header>
        <h1 className="font-display text-display-md font-semibold text-stone-900">Style catalog</h1>
        <p className="mt-1 text-sm text-stone-500">
          Eight curated house-wide design languages. Pick one when you create a project.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.data.items.map((entry) => (
          <li
            key={entry.key}
            className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"
          >
            <h2 className="font-display text-lg font-semibold text-stone-900">{entry.name}</h2>
            <p className="mt-2 text-sm text-stone-600">{entry.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {entry.colorTendencies.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500"
                >
                  {c}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}