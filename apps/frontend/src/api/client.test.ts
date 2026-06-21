import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/error';
import { apiFetch } from './client';

function mockJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockEmptyResponse(status: number): Response {
  return new Response(null, { status });
}

describe('apiFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends GET with credentials:include and parses JSON on 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, { sessionId: 's_1' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiFetch<{ sessionId: string }>('/session');

    expect(result).toEqual({ sessionId: 's_1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/session');
    expect(init.credentials).toBe('include');
    expect(init.method).toBeUndefined();
  });

  it('JSON-encodes body and sets Content-Type when passing an object', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(201, { id: 'p_1' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('/projects', { method: 'POST', body: { name: 'House' } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ name: 'House' }));
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('leaves FormData bodies alone (no Content-Type override)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(201, { id: 'r_1' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const form = new FormData();
    form.append('file', new File(['hello'], 'tile.png', { type: 'image/png' }));
    await apiFetch('/rooms/r1/references/upload', { method: 'POST', body: form });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    // The browser sets the multipart Content-Type with boundary itself;
    // the client must NOT override it.
    expect(headers.get('Content-Type')).toBeNull();
    expect(init.body).toBe(form);
  });

  it('normalizes 4xx envelope into an ApiError with code + fields + traceId', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockJsonResponse(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Validation failed.',
          fields: { name: 'should not be empty' },
          traceId: 'req_xyz',
        },
      }),
    ) as unknown as typeof fetch;

    await expect(apiFetch('/projects', { method: 'POST', body: { name: '' } })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      fields: { name: 'should not be empty' },
      traceId: 'req_xyz',
      message: 'Validation failed.',
    });
  });

  it('falls back to INTERNAL when the response body is not JSON', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('<html>oops</html>', { status: 500 })) as unknown as typeof fetch;

    await expect(apiFetch('/anything')).rejects.toBeInstanceOf(ApiError);
    try {
      await apiFetch('/anything');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.code).toBe('INTERNAL');
    }
  });

  it('returns undefined on 204 No Content without trying to parse JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockEmptyResponse(204));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiFetch<void>('/references/r_1', { method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  it('uses the INTERNAL code when the envelope code is missing', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockJsonResponse(500, { error: { message: 'boom' } })) as unknown as typeof fetch;

    try {
      await apiFetch('/x');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.code).toBe('INTERNAL');
      expect(apiErr.message).toBe('boom');
    }
  });

  it('captures Retry-After + RateLimit-* headers on 429 RATE_LIMITED', async () => {
    const res = mockJsonResponse(429, {
      error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded for generations.' },
    });
    // Decorate with the rate-limit advisory headers the backend
    // emits via the refreshed M17 RateLimitGuard (F12 hardening fix).
    Object.entries({
      'Retry-After': '42',
      'RateLimit-Limit': '5',
      'RateLimit-Remaining': '0',
      'RateLimit-Reset': '42',
    }).forEach(([k, v]) => res.headers.set(k, v));
    globalThis.fetch = vi.fn().mockResolvedValue(res) as unknown as typeof fetch;

    try {
      await apiFetch('/rooms/r1/generations', { method: 'POST', body: {} });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.code).toBe('RATE_LIMITED');
      expect(apiErr.isRateLimited()).toBe(true);
      expect(apiErr.retryAfter).toBe(42);
      expect(apiErr.rateLimit).toEqual({ limit: 5, remaining: 0, resetInSeconds: 42 });
    }
  });

  it('leaves retryAfter undefined when Retry-After header is absent', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        mockJsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'slow down' } }),
      ) as unknown as typeof fetch;

    try {
      await apiFetch('/rooms/r1/generations', { method: 'POST', body: {} });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.isRateLimited()).toBe(true);
      expect(apiErr.retryAfter).toBeUndefined();
      expect(apiErr.rateLimit).toBeUndefined();
    }
  });

  it('parses HTTP-date Retry-After into a seconds delta', async () => {
    const future = new Date(Date.now() + 30_000).toUTCString();
    const res = mockJsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'slow' } });
    res.headers.set('Retry-After', future);
    globalThis.fetch = vi.fn().mockResolvedValue(res) as unknown as typeof fetch;

    try {
      await apiFetch('/rooms/r1/generations', { method: 'POST', body: {} });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.retryAfter).toBeGreaterThanOrEqual(28);
      expect(apiErr.retryAfter).toBeLessThanOrEqual(31);
    }
  });
});