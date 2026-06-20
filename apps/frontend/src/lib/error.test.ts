import { describe, expect, it } from 'vitest';
import { ApiError } from './error';

describe('ApiError', () => {
  it('preserves status, code, fields, traceId, and message', () => {
    const err = new ApiError(400, 'VALIDATION_FAILED', {
      message: 'Validation failed.',
      fields: { name: 'should not be empty' },
      traceId: 'req_abc',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.fields).toEqual({ name: 'should not be empty' });
    expect(err.traceId).toBe('req_abc');
    expect(err.message).toBe('Validation failed.');
  });

  it('classifies 4xx as client error and 5xx as server error', () => {
    expect(new ApiError(400, 'VALIDATION_FAILED').isClientError()).toBe(true);
    expect(new ApiError(404, 'NOT_FOUND').isClientError()).toBe(true);
    expect(new ApiError(502, 'PROVIDER_TIMEOUT').isClientError()).toBe(false);
    expect(new ApiError(502, 'PROVIDER_TIMEOUT').isServerError()).toBe(true);
    expect(new ApiError(401, 'UNAUTHENTICATED').isServerError()).toBe(false);
  });

  it('defaults message to code when no message option is given', () => {
    const err = new ApiError(404, 'NOT_FOUND');
    expect(err.message).toBe('NOT_FOUND');
  });
});