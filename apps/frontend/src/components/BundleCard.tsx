import { formatBytes, formatDateTime } from '../lib/format';
import type { ListedExportBundle } from '../api/exports';

export interface BundleCardProps {
  bundle: ListedExportBundle;
  /**
   * When provided, renders a "Preview →" link to the bundle
   * detail page (`/exports/:bundleId`). The parent is expected
   * to render this for projects that own the bundle; non-owners
   * (e.g. cross-session history views) can omit it.
   */
  previewHref?: string;
  /**
   * When true, renders the bundle as the most recent (newest
   * first) — surfaces a "Latest" badge so the user knows what
   * "Re-export" will overwrite.
   */
  isLatest?: boolean;
}

export function BundleCard({ bundle, previewHref, isLatest }: BundleCardProps) {
  return (
    <article
      data-testid={`bundle-card-${bundle.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"
    >
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-lg font-semibold text-stone-900">
            v{bundle.version}
          </h3>
          {isLatest ? (
            <span
              data-testid="bundle-latest-badge"
              className="rounded-full bg-forest-500/10 px-2 py-0.5 text-xs font-medium text-forest-700"
            >
              Latest
            </span>
          ) : null}
        </div>
        <span className="text-xs text-stone-500">
          {formatDateTime(bundle.createdAt)}
        </span>
      </header>
      <p className="text-xs text-stone-500">
        {formatBytes(bundle.byteSize)} · {bundle.id.slice(0, 8)}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        {previewHref ? (
          <a
            href={previewHref}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
            data-testid={`bundle-preview-link-${bundle.id}`}
          >
            Preview →
          </a>
        ) : null}
        <span className="text-xs text-stone-400">
          Download URL is fetched from the preview page (short-TTL).
        </span>
      </div>
    </article>
  );
}
