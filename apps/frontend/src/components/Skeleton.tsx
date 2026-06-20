/**
 * Lightweight skeleton primitive. Pulses to indicate "loading" in a
 * calm, premium way (no spinners — see `docs/04-system-architecture.md
 * §4.2`: "honest loading states (no spinners where a skeleton is
 * appropriate)").
 *
 * Sized via Tailwind utility classes passed in by the caller. The
 * default renders a flat gray rectangle with a subtle pulse.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-stone-100 ${className}`}
    />
  );
}

/**
 * A skeleton list of N rows — used by `ProjectsPage` while the
 * projects query is pending.
 */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}