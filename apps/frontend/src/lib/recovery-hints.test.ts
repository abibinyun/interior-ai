import { describe, expect, it } from 'vitest';
import { recoveryHint } from './recovery-hints';
import { ApiError } from './error';

describe('recoveryHint', () => {
  it('returns "Refresh the page" for UNAUTHENTICATED', () => {
    expect(recoveryHint(new ApiError(401, 'UNAUTHENTICATED'))).toBe('Refresh the page');
  });

  it('returns "Wait a moment" for RATE_LIMITED', () => {
    expect(recoveryHint(new ApiError(429, 'RATE_LIMITED'))).toBe('Wait a moment');
  });

  it('returns "Go back" for NOT_FOUND', () => {
    expect(recoveryHint(new ApiError(404, 'NOT_FOUND'))).toBe('Go back');
  });

  it('returns "Edit the brief" for PROMPT_INVALID', () => {
    expect(recoveryHint(new ApiError(400, 'PROMPT_INVALID'))).toBe('Edit the brief');
  });

  it('returns "Try again" for every provider / storage / upload code', () => {
    for (const code of [
      'PROVIDER_TIMEOUT',
      'PROVIDER_REJECTED',
      'PROVIDER_BROKEN',
      'STORAGE_FAILED',
      'UPLOAD_REJECTED',
    ] as const) {
      expect(recoveryHint(new ApiError(502, code))).toBe('Try again');
    }
  });

  it('returns "Refresh and retry" for CONFLICT', () => {
    expect(recoveryHint(new ApiError(409, 'CONFLICT'))).toBe('Refresh and retry');
  });

  it('returns "Check the highlighted fields" for VALIDATION_FAILED', () => {
    expect(recoveryHint(new ApiError(400, 'VALIDATION_FAILED'))).toBe(
      'Check the highlighted fields',
    );
  });

  it('returns null for codes without a specific suggestion', () => {
    expect(recoveryHint(new ApiError(422, 'BUSINESS_RULE_VIOLATION'))).toBeNull();
    expect(recoveryHint(new ApiError(403, 'FORBIDDEN'))).toBeNull();
    expect(recoveryHint(new ApiError(500, 'INTERNAL'))).toBeNull();
  });

  it('returns null for non-ApiError values', () => {
    expect(recoveryHint(new Error('boom'))).toBeNull();
    expect(recoveryHint('boom')).toBeNull();
    expect(recoveryHint(null)).toBeNull();
    expect(recoveryHint(undefined)).toBeNull();
  });
});
