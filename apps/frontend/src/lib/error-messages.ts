import { ApiError, type ErrorCode } from './error';

/**
 * Map backend `ErrorCode`s to friendly user-facing text. This is the
 * early F10 work — every error code gets a single canonical message
 * that the UI can render directly. F10 will add per-screen styling
 * and recovery actions on top.
 *
 * Keep these short, action-oriented, and free of internal jargon
 * ("rate-limited" → "Too many requests — slow down for a moment").
 */
const FRIENDLY: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Some fields need attention. Check the highlighted inputs and try again.',
  PROMPT_INVALID: 'The design brief has something we couldn’t parse. Try rephrasing it.',
  UNAUTHENTICATED: 'Your session expired. Refresh the page to continue.',
  FORBIDDEN: 'You don’t have access to that item.',
  NOT_FOUND: 'We couldn’t find that. It may have been deleted.',
  CONFLICT: 'That action conflicts with the current state. Refresh and try again.',
  BUSINESS_RULE_VIOLATION: 'That action isn’t allowed right now.',
  PROVIDER_TIMEOUT: 'The image provider took too long. Try again in a moment.',
  PROVIDER_REJECTED: 'The image provider refused this request. Try a different prompt.',
  PROVIDER_BROKEN: 'The image provider returned something we couldn’t use. Try again.',
  STORAGE_FAILED: 'We couldn’t store the image. Try again in a moment.',
  UPLOAD_REJECTED: 'That file couldn’t be uploaded. Check the format and size.',
  RATE_LIMITED: 'You’re going a little fast — slow down for a moment and try again.',
  INTERNAL: 'Something went wrong on our end. We’ve been notified.',
};

/**
 * Translate an unknown error (typically an `ApiError`) into a
 * user-friendly message. Falls back to:
 * - `Error.message` for raw `Error` instances,
 * - the string itself for `string` values,
 * - a generic line for everything else.
 */
export function friendlyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return FRIENDLY[err.code] ?? 'Something went wrong.';
  }
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Something went wrong.';
}

/**
 * Returns the user-friendly title for an error code — short label
 * used in UI banners ("Too many requests", "Session expired", …).
 */
export function friendlyErrorTitle(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'UNAUTHENTICATED':
        return 'Session expired';
      case 'FORBIDDEN':
        return 'Not allowed';
      case 'NOT_FOUND':
        return 'Not found';
      case 'CONFLICT':
        return 'Conflict';
      case 'BUSINESS_RULE_VIOLATION':
        return 'Not allowed';
      case 'RATE_LIMITED':
        return 'Slow down';
      case 'PROVIDER_TIMEOUT':
      case 'PROVIDER_REJECTED':
      case 'PROVIDER_BROKEN':
        return 'Image provider issue';
      case 'STORAGE_FAILED':
      case 'UPLOAD_REJECTED':
        return 'Upload failed';
      case 'VALIDATION_FAILED':
        return 'Check your inputs';
      case 'PROMPT_INVALID':
        return 'Brief needs editing';
      default:
        return 'Something went wrong';
    }
  }
  return 'Something went wrong';
}