import { ConfigService } from '@nestjs/config';
import { HttpFetcher } from '../ai/adapters/pollinations.adapter';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  buildGenerationKey,
  buildReferenceKey,
  isStorageError,
} from './storage.adapter';
import { SupabaseStorageAdapter } from './supabase-storage.adapter';

interface FakeCall {
  url: string;
  init: { method: string; headers: Record<string, string>; body?: string; timeoutMs: number };
}

interface FakeResponse {
  status: number;
  body?: Buffer | string;
  contentType?: string;
}

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: <T = string>(key: string, fallback?: T): T => {
      const defaults: Record<string, unknown> = {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key-123',
        SUPABASE_STORAGE_BUCKET: 'generations',
      };
      const value = key in overrides ? overrides[key] : (defaults[key] ?? fallback);
      return value as T;
    },
  } as unknown as ConfigService;
}

function makeFakeHttp(
  responder: (call: FakeCall) => FakeResponse | Error,
): { fetcher: HttpFetcher; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fetcher: HttpFetcher = {
    async fetch(url, init) {
      const call: FakeCall = { url, init: { method: init.method, headers: init.headers, body: (init as { body?: string }).body, timeoutMs: init.timeoutMs } };
      calls.push(call);
      const response = responder(call);
      if (response instanceof Error) throw response;
      return {
        status: response.status,
        headers: { 'content-type': response.contentType ?? 'application/json' },
        body: async () => {
          if (typeof response.body === 'string') return Buffer.from(response.body, 'utf8');
          return response.body ?? Buffer.from('{}', 'utf8');
        },
      };
    },
  };
  return { fetcher, calls };
}

describe('SupabaseStorageAdapter', () => {
  describe('upload', () => {
    it('uploads a PNG buffer and returns the public URL', async () => {
      const { fetcher, calls } = makeFakeHttp(() => ({ status: 200, body: '' }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const result = await adapter.upload({
        key: 'dev/projects/p1/rooms/r1/generations/g1.png',
        body: png,
        contentType: 'image/png',
      });
      expect(result.key).toBe('dev/projects/p1/rooms/r1/generations/g1.png');
      expect(result.publicUrl).toBe('https://test.supabase.co/storage/v1/object/public/generations/dev/projects/p1/rooms/r1/generations/g1.png');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe('https://test.supabase.co/storage/v1/object/generations/dev/projects/p1/rooms/r1/generations/g1.png');
      expect(calls[0]!.init.method).toBe('POST');
      expect(calls[0]!.init.headers['Authorization']).toBe('Bearer service-key-123');
      expect(calls[0]!.init.headers['Content-Type']).toBe('image/png');
    });

    it('rejects uploads exceeding MAX_UPLOAD_BYTES (SG-06)', async () => {
      expect.assertions(2);
      const { fetcher } = makeFakeHttp(() => ({ status: 200 }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
      try {
        await adapter.upload({ key: 'k', body: huge, contentType: 'image/png' });
      } catch (err) {
        expect(isStorageError(err)).toBe(true);
        expect((err as { code: string }).code).toBe('UPLOAD_REJECTED');
      }
    });

    it('rejects empty content-type (sanity check)', async () => {
      // F9 hardening: the adapter no longer rejects non-image MIME
      // types (per-resource services validate their own MIME —
      // ReferencesService validates SG-06, ExportsService uses
      // application/zip, etc.). The adapter still rejects an empty
      // content-type as a defensive sanity check.
      expect.assertions(2);
      const { fetcher } = makeFakeHttp(() => ({ status: 200 }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      try {
        await adapter.upload({ key: 'k', body: Buffer.from('x'), contentType: '' });
      } catch (err) {
        expect(isStorageError(err)).toBe(true);
        expect((err as { code: string }).code).toBe('UPLOAD_REJECTED');
      }
    });

    it('accepts non-image content-types (e.g. application/zip for exports)', async () => {
      // F9 hardening: export bundles are application/zip — the
      // adapter must NOT reject non-image types. The previous
      // image-only gate was production-blocking.
      const { fetcher } = makeFakeHttp(() => ({ status: 200 }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      await expect(
        adapter.upload({ key: 'k', body: Buffer.from('zip'), contentType: 'application/zip' }),
      ).resolves.toMatchObject({ key: 'k' });
    });

    it('accepts all allowed MIME types', async () => {
      for (const mime of ALLOWED_IMAGE_MIME_TYPES) {
        const { fetcher } = makeFakeHttp(() => ({ status: 200 }));
        const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
        await expect(adapter.upload({ key: 'k', body: Buffer.from('x'), contentType: mime })).resolves.toMatchObject({ key: 'k' });
      }
    });

    it('maps 4xx to UPLOAD_REJECTED', async () => {
      expect.assertions(2);
      const { fetcher } = makeFakeHttp(() => ({ status: 413 }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      try {
        await adapter.upload({ key: 'k', body: Buffer.from('x'), contentType: 'image/png' });
      } catch (err) {
        expect(isStorageError(err)).toBe(true);
        expect((err as { code: string }).code).toBe('UPLOAD_REJECTED');
      }
    });

    it('maps 5xx to STORAGE_FAILED', async () => {
      expect.assertions(2);
      const { fetcher } = makeFakeHttp(() => ({ status: 503 }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      try {
        await adapter.upload({ key: 'k', body: Buffer.from('x'), contentType: 'image/png' });
      } catch (err) {
        expect(isStorageError(err)).toBe(true);
        expect((err as { code: string }).code).toBe('STORAGE_FAILED');
      }
    });

    it('maps network errors to STORAGE_FAILED', async () => {
      expect.assertions(2);
      const { fetcher } = makeFakeHttp(() => new Error('ECONNREFUSED'));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      try {
        await adapter.upload({ key: 'k', body: Buffer.from('x'), contentType: 'image/png' });
      } catch (err) {
        expect(isStorageError(err)).toBe(true);
        expect((err as { code: string }).code).toBe('STORAGE_FAILED');
      }
    });
  });

  describe('signedUrl', () => {
    it('returns a signed URL with expiresAt', async () => {
      const signedPath = '/storage/v1/object/sign/generations/k.png?token=abc';
      const { fetcher, calls } = makeFakeHttp(() => ({
        status: 200,
        body: JSON.stringify({ signedURL: signedPath }),
      }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      const before = Date.now();
      const result = await adapter.signedUrl('k.png', 900);
      expect(result.key).toBe('k.png');
      expect(result.signedUrl).toBe('https://test.supabase.co/storage/v1/object/sign/generations/k.png?token=abc');
      expect(calls[0]!.init.body).toBe(JSON.stringify({ expiresIn: 900 }));
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 900000 - 50);
    });

    it('uses absolute signed URL as-is', async () => {
      const absolute = 'https://cdn.example.com/signed';
      const { fetcher } = makeFakeHttp(() => ({
        status: 200,
        body: JSON.stringify({ signedURL: absolute }),
      }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      const result = await adapter.signedUrl('k', 60);
      expect(result.signedUrl).toBe(absolute);
    });

    it('prepends /storage/v1 to legacy /object/sign/... path (export bundle bug fix)', async () => {
      // Supabase's current API returns the signed URL as a relative
      // path in the LEGACY form `/object/sign/<bucket>/<key>?token=...`
      // (no `/storage/v1/` prefix). When a client GETs that path
      // as-is, Supabase responds 404 with
      // `{"error":"requested path is invalid"}` because the legacy
      // `/object/sign/...` endpoint doesn't accept signed downloads.
      // The correct download path is `/storage/v1/object/sign/...`.
      // The adapter must rewrite the relative path before returning.
      const legacyPath = '/object/sign/generations/development/exports/projects/p1/v1.zip?token=eyJabc';
      const { fetcher } = makeFakeHttp(() => ({
        status: 200,
        body: JSON.stringify({ signedURL: legacyPath }),
      }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      const result = await adapter.signedUrl('development/exports/projects/p1/v1.zip', 900);
      expect(result.signedUrl).toBe(
        'https://test.supabase.co/storage/v1/object/sign/generations/development/exports/projects/p1/v1.zip?token=eyJabc',
      );
    });

    it('preserves already-versioned /storage/... path as-is', async () => {
      const versionedPath = '/storage/v1/object/sign/generations/k.png?token=xyz';
      const { fetcher } = makeFakeHttp(() => ({
        status: 200,
        body: JSON.stringify({ signedURL: versionedPath }),
      }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      const result = await adapter.signedUrl('k.png', 60);
      expect(result.signedUrl).toBe('https://test.supabase.co/storage/v1/object/sign/generations/k.png?token=xyz');
    });

    it('falls back to prepending /storage/v1 for unknown relative forms', async () => {
      // Defensive: if Supabase ever returns a relative path that
      // doesn't start with `/storage/` or `/object/`, prepend
      // `/storage/v1` so the URL still hits the versioned API.
      const weirdPath = '/sign/generations/k.png?token=q';
      const { fetcher } = makeFakeHttp(() => ({
        status: 200,
        body: JSON.stringify({ signedURL: weirdPath }),
      }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      const result = await adapter.signedUrl('k.png', 60);
      expect(result.signedUrl).toBe('https://test.supabase.co/storage/v1/sign/generations/k.png?token=q');
    });

    it('maps errors to STORAGE_FAILED', async () => {
      expect.assertions(2);
      const { fetcher } = makeFakeHttp(() => ({ status: 500 }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      try {
        await adapter.signedUrl('k', 60);
      } catch (err) {
        expect(isStorageError(err)).toBe(true);
        expect((err as { code: string }).code).toBe('STORAGE_FAILED');
      }
    });
  });

  describe('delete', () => {
    it('deletes an object', async () => {
      const { fetcher, calls } = makeFakeHttp(() => ({ status: 200 }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      await adapter.delete('k.png');
      expect(calls[0]!.init.method).toBe('DELETE');
    });

    it('treats 404 as success (idempotent)', async () => {
      const { fetcher } = makeFakeHttp(() => ({ status: 404 }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      await expect(adapter.delete('missing.png')).resolves.toBeUndefined();
    });

    it('maps 5xx to STORAGE_FAILED', async () => {
      expect.assertions(2);
      const { fetcher } = makeFakeHttp(() => ({ status: 500 }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      try {
        await adapter.delete('k.png');
      } catch (err) {
        expect(isStorageError(err)).toBe(true);
        expect((err as { code: string }).code).toBe('STORAGE_FAILED');
      }
    });
  });

  describe('without SUPABASE_URL', () => {
    it('throws STORAGE_FAILED on upload', async () => {
      expect.assertions(2);
      const { fetcher } = makeFakeHttp(() => ({ status: 200 }));
      const adapter = new SupabaseStorageAdapter(makeConfig({ SUPABASE_URL: undefined }), fetcher);
      try {
        await adapter.upload({ key: 'k', body: Buffer.from('x'), contentType: 'image/png' });
      } catch (err) {
        expect(isStorageError(err)).toBe(true);
        expect((err as { code: string }).code).toBe('STORAGE_FAILED');
      }
    });
  });
});

describe('key builders', () => {
  it('builds generation keys per ADR-004', () => {
    const key = buildGenerationKey('dev', 'p1', 'r1', 'g1', 'image/png');
    expect(key).toBe('dev/projects/p1/rooms/r1/generations/g1.png');
  });

  it('maps content-type to extension for generations', () => {
    expect(buildGenerationKey('dev', 'p', 'r', 'g', 'image/jpeg')).toContain('.jpg');
    expect(buildGenerationKey('dev', 'p', 'r', 'g', 'image/webp')).toContain('.webp');
  });

  it('builds reference keys per SG-04', () => {
    const key = buildReferenceKey('dev', 'p1', 'r1', 'ref1', 'living room.jpg');
    expect(key).toBe('dev/projects/p1/rooms/r1/references/ref1/living_room.jpg');
  });

  it('sanitizes reference filenames', () => {
    const key = buildReferenceKey('dev', 'p', 'r', 'ref', '../../etc/passwd');
    expect(key).not.toContain('..');
    expect(key).not.toContain('/etc/');
  });
});
