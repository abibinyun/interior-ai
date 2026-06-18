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

    it('rejects unsupported content-types (SG-06)', async () => {
      expect.assertions(2);
      const { fetcher } = makeFakeHttp(() => ({ status: 200 }));
      const adapter = new SupabaseStorageAdapter(makeConfig(), fetcher);
      try {
        await adapter.upload({ key: 'k', body: Buffer.from('x'), contentType: 'application/pdf' });
      } catch (err) {
        expect(isStorageError(err)).toBe(true);
        expect((err as { code: string }).code).toBe('UPLOAD_REJECTED');
      }
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
