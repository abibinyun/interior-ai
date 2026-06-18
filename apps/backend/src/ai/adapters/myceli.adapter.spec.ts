import { ConfigService } from '@nestjs/config';
import { HttpFetcher } from './pollinations.adapter';
import { MyceliAdapter } from './myceli.adapter';
import { isProviderError } from './ai-provider.adapter';

interface FakeCall {
  url: string;
  init: { method: string; headers: Record<string, string>; body?: string; timeoutMs: number };
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
        AI_FALLBACK_BASE_URL: 'https://api.myceli.ai',
        AI_FALLBACK_API_KEY: '',
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
      calls.push({ url, init: { method: init.method, headers: init.headers, body: (init as { body?: string }).body, timeoutMs: init.timeoutMs } });
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

describe('MyceliAdapter', () => {
  it('returns a Buffer for a successful generation (POST JSON)', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const { fetcher, calls } = makeFakeHttp({ status: 200, body: pngBytes });
    const adapter = new MyceliAdapter(makeConfig(), fetcher);
    const result = await adapter.generate({ prompt: 'a warm living room', width: 512, height: 512, seed: 7 });
    expect(result.provider).toBe('myceli');
    expect(result.imageBuffer).toEqual(pngBytes);
    expect(result.contentType).toBe('image/png');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.myceli.ai/v1/generate');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(calls[0]!.init.body!);
    expect(body).toMatchObject({ prompt: 'a warm living room', width: 512, height: 512, seed: 7 });
  });

  it('maps 4xx to PROVIDER_REJECTED', async () => {
    const { fetcher } = makeFakeHttp({ status: 422 });
    const adapter = new MyceliAdapter(makeConfig(), fetcher);
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
      provider: 'myceli',
      statusCode: 422,
    });
  });

  it('maps 5xx to PROVIDER_BROKEN', async () => {
    const { fetcher } = makeFakeHttp({ status: 502 });
    const adapter = new MyceliAdapter(makeConfig(), fetcher);
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_BROKEN',
      provider: 'myceli',
      statusCode: 502,
    });
  });

  it('maps non-image content-type to PROVIDER_BROKEN', async () => {
    const { fetcher } = makeFakeHttp({ status: 200, contentType: 'text/html' });
    const adapter = new MyceliAdapter(makeConfig(), fetcher);
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_BROKEN',
      provider: 'myceli',
    });
  });

  it('maps AbortError to PROVIDER_TIMEOUT', async () => {
    expect.assertions(2);
    const abortErr = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const { fetcher } = makeFakeHttp(abortErr);
    const adapter = new MyceliAdapter(makeConfig(), fetcher);
    try {
      await adapter.generate({ prompt: 'x' });
    } catch (err) {
      expect(isProviderError(err)).toBe(true);
      expect((err as { code: string }).code).toBe('PROVIDER_TIMEOUT');
    }
  });

  it('includes Authorization header when API key is set', async () => {
    const { fetcher, calls } = makeFakeHttp({ status: 200 });
    const adapter = new MyceliAdapter(
      makeConfig({ AI_FALLBACK_API_KEY: 'sk_fb_456' }),
      fetcher,
    );
    await adapter.generate({ prompt: 'x' });
    expect(calls[0]!.init.headers['Authorization']).toBe('Bearer sk_fb_456');
  });
});
