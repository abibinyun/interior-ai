import { friendlyErrorMessage, friendlyErrorTitle } from '../lib/error-messages';
import { recoveryHint } from '../lib/recovery-hints';

/**
 * Error-state primitive. Renders a friendly error card with optional
 * retry and a per-code recovery hint (F10). The heading uses
 * `friendlyErrorTitle`, the body uses `friendlyErrorMessage`, and an
 * optional small "Try again"-style line shows the recovery hint when
 * one is mapped for this code.
 *
 * Use directly with an `ApiError` (or any thrown value) — the
 * message is translated via the mappers so we never leak raw
 * exception text to the user.
 */
export function ErrorState({
  error,
  onRetry,
  title,
  hideHint,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  /**
   * Set to `true` to suppress the per-code recovery hint line
   * (e.g. when the surrounding page already shows its own hint
   * or when an `onRetry` button already conveys the next step).
   */
  hideHint?: boolean;
}) {
  const heading = title ?? friendlyErrorTitle(error);
  const body = friendlyErrorMessage(error);
  const hint = hideHint ? null : recoveryHint(error);
  // Only expose traceId for actual ApiErrors (defensive).
  const traceId =
    error && typeof error === 'object' && 'traceId' in error
      ? (error as { traceId?: string }).traceId
      : undefined;

  return (
    <div
      role="alert"
      data-testid="error-state"
      className="placeholder-card mx-auto max-w-xl space-y-3 border-clay-500/30 bg-clay-500/5"
    >
      <h2 className="font-display text-lg font-semibold text-stone-900">{heading}</h2>
      <p className="text-stone-700">{body}</p>
      {hint ? (
        <p className="text-xs text-stone-500">
          <span className="font-medium uppercase tracking-wider text-stone-400">Next step · </span>
          {hint}
        </p>
      ) : null}
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
          data-testid="error-state-retry"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}