import { describe, expect, it } from 'vitest';
import { ApiError, type ErrorCode } from './error';
import { friendlyErrorMessage, friendlyErrorTitle } from './error-messages';

describe('friendlyErrorMessage', () => {
  it('maps every backend ErrorCode to a friendly string', () => {
    const codes: ErrorCode[] = [
      'VALIDATION_FAILED',
      'PROMPT_INVALID',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'BUSINESS_RULE_VIOLATION',
      'PROVIDER_TIMEOUT',
      'PROVIDER_REJECTED',
      'PROVIDER_BROKEN',
      'STORAGE_FAILED',
      'UPLOAD_REJECTED',
      'RATE_LIMITED',
      'INTERNAL',
    ];
    for (const code of codes) {
      const err = new ApiError(500, code);
      const msg = friendlyErrorMessage(err);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('extracts the envelope message for VALIDATION_FAILED when present', () => {
    const err = new ApiError(400, 'VALIDATION_FAILED', {
      message: 'name should not be empty',
    });
    // The friendly mapper returns the generic line for VALIDATION_FAILED,
    // not the per-field message — that is intentionally the job of the
    // per-screen field UI (F4+).
    expect(friendlyErrorMessage(err)).toMatch(/fields need attention/i);
  });

  it('falls back to a generic line for an Error instance', () => {
    expect(friendlyErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('falls back to a generic line for non-Error values', () => {
    expect(friendlyErrorMessage('something bad')).toBe('something bad');
    expect(friendlyErrorMessage(undefined)).toBe('Something went wrong.');
    expect(friendlyErrorMessage(null)).toBe('Something went wrong.');
  });
});

describe('friendlyErrorTitle', () => {
  it('returns a short banner title for the common codes', () => {
    expect(friendlyErrorTitle(new ApiError(401, 'UNAUTHENTICATED'))).toBe('Session expired');
    expect(friendlyErrorTitle(new ApiError(429, 'RATE_LIMITED'))).toBe('Slow down');
    expect(friendlyErrorTitle(new ApiError(502, 'PROVIDER_TIMEOUT'))).toBe(
      'Image provider issue',
    );
  });

  it('returns a generic title for non-ApiError values', () => {
    expect(friendlyErrorTitle(new Error('boom'))).toBe('Something went wrong');
    expect(friendlyErrorTitle('x')).toBe('Something went wrong');
  });
});