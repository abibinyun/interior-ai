import type { ReactNode } from 'react';

/**
 * Empty-state primitive. Used for first-time visitors and zero-result
 * lists. The headline is what the user sees first; the supporting text
 * explains why; the children slot is for a primary call-to-action
 * (e.g. a "Create Project" button).
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="placeholder-card mx-auto max-w-xl space-y-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cream-100 text-2xl font-display text-stone-700">
        ✶
      </div>
      <h2 className="font-display text-2xl font-semibold text-stone-900">{title}</h2>
      {description ? <p className="text-stone-600">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}