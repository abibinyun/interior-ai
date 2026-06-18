import { ConfigService } from '@nestjs/config';
import { HttpFetcher, PollinationsAdapter } from './pollinations.adapter';
import { isProviderError } from './ai-provider.adapter';

interface FakeCall {
  url: string;
  init: { method: string; headers: Record<string, string>; timeoutMs: number };
}

interface FakeResponse {
  status: number;
  body?: Buffer;
  contentType?: string;
}

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: <T = string>(key: string, fallback?: T): T => {
      const defaults: Record<string, unknown> = {
        AI_PRIMARY_BASE_URL: 'https://gen.pollinations.ai',
        AI_PRIMARY_API_KEY: '',
        GENERATION_HARD_TIMEOUT_MS: 90000,
      };
      const value = key in overrides ? overrides[key] : (defaults[key] ?? fallback);
      return value as T;
    },
  } as unknown as ConfigService;
}

function makeFakeHttp(
  response: FakeResponse | Error,
): { fetcher: HttpFetcher; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fetcher: HttpFetcher = {
    async fetch(url, init) {
      calls.push({ url, init: { method: init.method, headers: init.headers, timeoutMs: init.timeoutMs } });
      if (response instanceof Error) throw response;
      return {
        status: response.status,
        headers: { 'content-type': response.contentType ?? 'image/png' },
        body: async () => response.body ?? Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      };
    },
  };
  return { fetcher, calls };
}

describe('PollinationsAdapter', () => {
  it('returns a Buffer for a successful generation', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const { fetcher, calls } = makeFakeHttp({ status: 200, body: pngBytes });
    const adapter = new PollinationsAdapter(makeConfig(), fetcher);
    const result = await adapter.generate({ prompt: 'a warm living room' });
    expect(result.provider).toBe('pollinations');
    expect(result.imageBuffer).toEqual(pngBytes);
    expect(result.contentType).toBe('image/png');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('gen.pollinations.ai/image/');
    expect(decodeURIComponent(calls[0]!.url)).toContain('a warm living room');
  });

  it('maps 4xx to PROVIDER_REJECTED', async () => {
    const { fetcher } = makeFakeHttp({ status: 400 });
    const adapter = new PollinationsAdapter(makeConfig(), fetcher);
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
      provider: 'pollinations',
      statusCode: 400,
    });
  });

  it('maps 5xx to PROVIDER_BROKEN (transient, eligible for fallback)', async () => {
    const { fetcher } = makeFakeHttp({ status: 503 });
    const adapter = new PollinationsAdapter(makeConfig(), fetcher);
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_BROKEN',
      provider: 'pollinations',
      statusCode: 503,
    });
  });

  it('maps non-image content-type to PROVIDER_BROKEN', async () => {
    const { fetcher } = makeFakeHttp({ status: 200, contentType: 'application/json' });
    const adapter = new PollinationsAdapter(makeConfig(), fetcher);
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_BROKEN',
      provider: 'pollinations',
    });
  });

  it('maps AbortError to PROVIDER_TIMEOUT', async () => {
    expect.assertions(2);
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { fetcher } = makeFakeHttp(abortErr);
    const adapter = new PollinationsAdapter(makeConfig(), fetcher);
    try {
      await adapter.generate({ prompt: 'x' });
    } catch (err) {
      expect(isProviderError(err)).toBe(true);
      expect((err as { code: string }).code).toBe('PROVIDER_TIMEOUT');
    }
  });

  it('maps network errors to PROVIDER_BROKEN', async () => {
    expect.assertions(2);
    const { fetcher } = makeFakeHttp(new Error('ECONNREFUSED'));
    const adapter = new PollinationsAdapter(makeConfig(), fetcher);
    try {
      await adapter.generate({ prompt: 'x' });
    } catch (err) {
      expect(isProviderError(err)).toBe(true);
      expect((err as { code: string }).code).toBe('PROVIDER_BROKEN');
    }
  });

  it('includes Authorization header when API key is set', async () => {
    const { fetcher, calls } = makeFakeHttp({ status: 200 });
    const adapter = new PollinationsAdapter(
      makeConfig({ AI_PRIMARY_API_KEY: 'sk_test_123' }),
      fetcher,
    );
    await adapter.generate({ prompt: 'x' });
    expect(calls[0]!.init.headers['Authorization']).toBe('Bearer sk_test_123');
  });

  it('omits Authorization header when no API key', async () => {
    const { fetcher, calls } = makeFakeHttp({ status: 200 });
    const adapter = new PollinationsAdapter(makeConfig(), fetcher);
    await adapter.generate({ prompt: 'x' });
    expect(calls[0]!.init.headers['Authorization']).toBeUndefined();
  });

  it('builds URL with width/height/seed/negative params', async () => {
    const { fetcher, calls } = makeFakeHttp({ status: 200 });
    const adapter = new PollinationsAdapter(makeConfig(), fetcher);
    await adapter.generate({ prompt: 'x', width: 1024, height: 768, seed: 42, negativePrompt: 'blur' });
    const url = calls[0]!.url;
    expect(url).toContain('width=1024');
    expect(url).toContain('height=768');
    expect(url).toContain('seed=42');
    expect(url).toContain('negative=');
  });
});
