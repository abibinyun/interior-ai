import { ApiError } from './error';

/**
 * Suggested action label for an error. Components can render this
 * inside `<ErrorState>` (via the `onRetry` callback's UI) or as
 * a hint below the friendly message. Returns `null` when no
 * specific suggestion is more helpful than a generic "Try again".
 *
 * Maps backend `ErrorCode`s to the most useful next step:
 *
 *  - `UNAUTHENTICATED` → "Refresh the page" (session re-issue)
 *  - `RATE_LIMITED`     → "Wait a moment" (back off)
 *  - `NOT_FOUND`        → "Go back" (the row was deleted)
 *  - `PROMPT_INVALID`   → "Edit the brief" (per the F4 generation UX)
 *  - `PROVIDER_*`       → "Try again" (transient)
 *  - `STORAGE_FAILED`,
 *    `UPLOAD_REJECTED`  → "Try again" (transient)
 *  - `CONFLICT`         → "Refresh" (the state moved)
 *  - `VALIDATION_FAILED`→ "Check the highlighted fields"
 *  - `BUSINESS_RULE_*`  → null (the friendly message names the rule)
 *  - everything else    → null (generic Try again via onRetry)
 */
export function recoveryHint(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  switch (err.code) {
    case 'UNAUTHENTICATED':
      return 'Refresh the page';
    case 'RATE_LIMITED':
      return 'Wait a moment';
    case 'NOT_FOUND':
      return 'Go back';
    case 'PROMPT_INVALID':
      return 'Edit the brief';
    case 'PROVIDER_TIMEOUT':
    case 'PROVIDER_REJECTED':
    case 'PROVIDER_BROKEN':
    case 'STORAGE_FAILED':
    case 'UPLOAD_REJECTED':
      return 'Try again';
    case 'CONFLICT':
      return 'Refresh and retry';
    case 'VALIDATION_FAILED':
      return 'Check the highlighted fields';
    default:
      return null;
  }
}
