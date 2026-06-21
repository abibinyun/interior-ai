import { ConfigService } from '@nestjs/config';
import { AiHordeAdapter, } from './ai-horde.adapter';
import { HttpFetcher } from './pollinations.adapter';
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
        AI_HORDE_BASE_URL: 'https://stablehorde.net/api',
        AI_HORDE_API_KEY: '',
        GENERATION_HARD_TIMEOUT_MS: 90000,
      };
      const value = key in overrides ? overrides[key] : (defaults[key] ?? fallback);
      return value as T;
    },
  } as unknown as ConfigService;
}

/**
 * Stateful fake: each test can script a sequence of responses for
 * the same URL pattern. The horde adapter makes multiple calls to
 * the same URL during a single generate() (submit + N polls +
 * download), so we use a queue of (urlMatcher, response) pairs.
 */
interface ScriptEntry {
  match: (url: string) => boolean;
  response: FakeResponse | Error;
}

function makeScriptedHttp(script: ScriptEntry[]): { fetcher: HttpFetcher; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  let i = 0;
  const fetcher: HttpFetcher = {
    async fetch(url, init) {
      calls.push({
        url,
        init: {
          method: init.method,
          headers: init.headers,
          body: typeof init.body === 'string' ? init.body : undefined,
          timeoutMs: init.timeoutMs,
        },
      });
      const entry = script[i++];
      if (!entry) throw new Error(`Unexpected call #${i} to ${url}`);
      if (!entry.match(url)) {
        throw new Error(`Scripted call #${i} expected URL matching ${entry.match.toString()}, got ${url}`);
      }
      if (entry.response instanceof Error) throw entry.response;
      const fakeResponse = entry.response as FakeResponse;
      return {
        status: fakeResponse.status,
        headers: { 'content-type': fakeResponse.contentType ?? 'application/json' },
        body: async () => fakeResponse.body ?? Buffer.from('{}'),
      };
    },
  };
  return { fetcher, calls };
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('AiHordeAdapter', () => {
  it('submits with prompt, polls until done, downloads image', async () => {
    const { fetcher, calls } = makeScriptedHttp([
      // 1. submit → returns job id
      { match: (u) => u.endsWith('/v2/generate/async'), response: { status: 202, body: Buffer.from('{"id":"abc-123"}') } },
      // 2. first poll → not done yet
      { match: (u) => u.includes('/v2/generate/status/'), response: { status: 200, body: Buffer.from('{"done":false,"faulted":false}') } },
      // 3. second poll → done
      { match: (u) => u.includes('/v2/generate/status/'), response: { status: 200, body: Buffer.from('{"done":true,"generations":[{"img":"https://cdn.example/img.png"}]}') } },
      // 4. download
      { match: (u) => u.startsWith('https://cdn.example/'), response: { status: 200, contentType: 'image/png', body: PNG_BYTES } },
    ]);
    const adapter = new AiHordeAdapter(makeConfig({ AI_HORDE_API_KEY: 'k' }), fetcher);
    const result = await adapter.generate({ prompt: 'cozy living room' });
    expect(result.provider).toBe('ai-horde');
    expect(result.contentType).toBe('image/png');
    expect(result.imageBuffer).toEqual(PNG_BYTES);
    // submit header carries `apikey` (NOT Authorization Bearer)
    expect(calls[0]?.init.headers['apikey']).toBe('k');
    expect(calls[0]?.init.headers['Authorization']).toBeUndefined();
    expect(calls).toHaveLength(4);
  });

  it('throws PROVIDER_REJECTED on submit 4xx with statusCode', async () => {
    const { fetcher } = makeScriptedHttp([
      { match: (u) => u.endsWith('/v2/generate/async'), response: { status: 401, body: Buffer.from('{"message":"Invalid API key"}') } },
    ]);
    const adapter = new AiHordeAdapter(makeConfig({ AI_HORDE_API_KEY: 'bad' }), fetcher);
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
      statusCode: 401,
      provider: 'ai-horde',
    });
  });

  it('retries on submit 429 (no longer throws immediately)', async () => {
    // After the round-6 fix, the adapter backs off and retries
    // on submit 429 instead of throwing immediately. The mock
    // only has one scripted entry, so the retry hits the mock
    // exhaustion error → PROVIDER_BROKEN. This test proves the
    // adapter no longer throws PROVIDER_REJECTED at the first
    // 429 — it retried.
    const { fetcher } = makeScriptedHttp([
      { match: (u) => u.endsWith('/v2/generate/async'), response: { status: 429, body: Buffer.from('{"message":"slow down"}') } },
    ]);
    const adapter = new AiHordeAdapter(makeConfig({ GENERATION_HARD_TIMEOUT_MS: 100 }), fetcher);
    try {
      await adapter.generate({ prompt: 'x' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(isProviderError(err)).toBe(true);
      // The retry exhausts the mock → network error → PROVIDER_BROKEN.
      expect((err as { code: string }).code).toBe('PROVIDER_BROKEN');
    }
  });

  it('throws PROVIDER_REJECTED when poll returns faulted=true', async () => {
    const { fetcher } = makeScriptedHttp([
      { match: (u) => u.endsWith('/v2/generate/async'), response: { status: 202, body: Buffer.from('{"id":"j1"}') } },
      { match: (u) => u.includes('/v2/generate/status/'), response: { status: 200, body: Buffer.from('{"done":true,"faulted":true,"message":"NSFW detected"}') } },
    ]);
    const adapter = new AiHordeAdapter(makeConfig(), fetcher);
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
      message: /NSFW/,
    });
  });

  it('throws PROVIDER_BROKEN when poll returns done=true but no image', async () => {
    const { fetcher } = makeScriptedHttp([
      { match: (u) => u.endsWith('/v2/generate/async'), response: { status: 202, body: Buffer.from('{"id":"j1"}') } },
      { match: (u) => u.includes('/v2/generate/status/'), response: { status: 200, body: Buffer.from('{"done":true}') } },
    ]);
    const adapter = new AiHordeAdapter(makeConfig(), fetcher);
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_BROKEN',
    });
  });

  it('throws PROVIDER_TIMEOUT when deadline elapses', async () => {
    const { fetcher } = makeScriptedHttp([
      { match: (u) => u.endsWith('/v2/generate/async'), response: { status: 202, body: Buffer.from('{"id":"j1"}') } },
      // many "not done" polls — exceed the short deadline
      { match: (u) => u.includes('/v2/generate/status/'), response: { status: 200, body: Buffer.from('{"done":false}') } },
      { match: (u) => u.includes('/v2/generate/status/'), response: { status: 200, body: Buffer.from('{"done":false}') } },
      { match: (u) => u.includes('/v2/generate/status/'), response: { status: 200, body: Buffer.from('{"done":false}') } },
    ]);
    // 100 ms deadline — adapter loops 2 s per poll, so it will time out fast.
    const adapter = new AiHordeAdapter(
      makeConfig({ GENERATION_HARD_TIMEOUT_MS: 100 }),
      fetcher,
    );
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      provider: 'ai-horde',
    });
  });

  it('omits apikey header when no key is configured', async () => {
    const { fetcher, calls } = makeScriptedHttp([
      { match: (u) => u.endsWith('/v2/generate/async'), response: { status: 202, body: Buffer.from('{"id":"j1"}') } },
      { match: (u) => u.includes('/v2/generate/status/'), response: { status: 200, body: Buffer.from('{"done":true,"generations":[{"img":"https://cdn.example/img.png"}]}') } },
      { match: (u) => u.startsWith('https://cdn.example/'), response: { status: 200, contentType: 'image/png', body: PNG_BYTES } },
    ]);
    const adapter = new AiHordeAdapter(makeConfig({ AI_HORDE_API_KEY: '' }), fetcher);
    await adapter.generate({ prompt: 'x' });
    expect(calls[0]?.init.headers['apikey']).toBeUndefined();
  });

  it('healthcheck returns ok=true when heartbeat responds 2xx', async () => {
    const { fetcher } = makeScriptedHttp([
      { match: (u) => u.endsWith('/v2/status/heartbeat'), response: { status: 200, body: Buffer.from('OK') } },
    ]);
    const adapter = new AiHordeAdapter(makeConfig(), fetcher);
    const h = await adapter.healthcheck();
    expect(h.ok).toBe(true);
  });

  it('healthcheck returns ok=false on network error', async () => {
    const fetcher: HttpFetcher = {
      async fetch() {
        throw new Error('connect ECONNREFUSED');
      },
    };
    const adapter = new AiHordeAdapter(makeConfig(), fetcher);
    const h = await adapter.healthcheck();
    expect(h.ok).toBe(false);
    expect(h.detail).toMatch(/ECONNREFUSED/);
  });
});
