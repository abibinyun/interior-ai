import { friendlyErrorMessage, friendlyErrorTitle } from '../lib/error-messages';

/**
 * Error-state primitive. Renders a friendly error card with optional
 * retry and trace-id display (for support requests).
 *
 * Use directly with an `ApiError` (or any thrown value) — the message
 * is translated via `friendlyErrorMessage` / `friendlyErrorTitle` so
 * we never leak raw exception text to the user.
 */
export function ErrorState({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const heading = title ?? friendlyErrorTitle(error);
  const body = friendlyErrorMessage(error);
  // Only expose traceId for actual ApiErrors (defensive).
  const traceId =
    error && typeof error === 'object' && 'traceId' in error
      ? (error as { traceId?: string }).traceId
      : undefined;

  return (
    <div
      role="alert"
      className="placeholder-card mx-auto max-w-xl space-y-3 border-clay-500/30 bg-clay-500/5"
    >
      <h2 className="font-display text-lg font-semibold text-stone-900">{heading}</h2>
      <p className="text-stone-700">{body}</p>
      {traceId ? (
        <p className="text-xs text-stone-400">
          Reference: <code className="font-mono text-stone-500">{traceId}</code>
        </p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}