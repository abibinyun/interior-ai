import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderAdapter, GenerationRequest, GenerationResult, ProviderError, ProviderHealth } from './ai-provider.adapter';

export interface HttpFetcher {
  fetch(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      // BodyInit covers string | Uint8Array | FormData | etc. We
      // declare the shape loosely here because undici's types are
      // stricter than ours — and we accept Buffer for binary uploads.
      body?: string | Uint8Array | Buffer;
      signal: AbortSignal;
      timeoutMs: number;
    },
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: () => Promise<Buffer>;
  }>;
}

export const HTTP_FETCHER = Symbol('HTTP_FETCHER');

@Injectable()
export class PollinationsAdapter implements AiProviderAdapter {
  readonly name = 'pollinations';
  private readonly logger = new Logger(PollinationsAdapter.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly hardTimeoutMs: number;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(HTTP_FETCHER) private readonly http: HttpFetcher,
  ) {
    this.baseUrl = config.get<string>('AI_PRIMARY_BASE_URL', 'https://gen.pollinations.ai');
    this.apiKey = config.get<string>('AI_PRIMARY_API_KEY', '');
    this.hardTimeoutMs = config.get<number>('GENERATION_HARD_TIMEOUT_MS', 90000);
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const url = this.buildUrl(request);
    const headers: Record<string, string> = { Accept: 'image/png' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.hardTimeoutMs);

    let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
    try {
      response = await this.http.fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        timeoutMs: this.hardTimeoutMs,
      });
    } catch (err) {
      clearTimeout(timeout);
      throw this.mapNetworkError(err);
    }
    clearTimeout(timeout);

    if (response.status >= 400 && response.status < 500) {
      const err: ProviderError = Object.assign(
        new Error(`Pollinations returned ${response.status}`),
        { code: 'PROVIDER_REJECTED' as const, provider: this.name, statusCode: response.status },
      );
      throw err;
    }

    if (response.status >= 500) {
      const err: ProviderError = Object.assign(
        new Error(`Pollinations server error ${response.status}`),
        { code: 'PROVIDER_BROKEN' as const, provider: this.name, statusCode: response.status },
      );
      throw err;
    }

    const contentType = response.headers['content-type'] ?? 'image/png';
    if (!contentType.startsWith('image/')) {
      const err: ProviderError = Object.assign(
        new Error(`Pollinations returned non-image content-type: ${contentType}`),
        { code: 'PROVIDER_BROKEN' as const, provider: this.name },
      );
      throw err;
    }

    const imageBuffer = await response.body();
    return {
      imageBuffer,
      contentType,
      provider: this.name,
    };
  }

  async healthcheck(): Promise<ProviderHealth> {
    // GET the base URL with a short timeout. A 2xx/3xx/4xx all prove
    // reachability; only network failure (timeout, DNS, refused)
    // counts as `ok: false`.
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await this.http.fetch(this.baseUrl, {
        method: 'GET',
        headers: {},
        signal: controller.signal,
        timeoutMs: 2000,
      });
      const latencyMs = Date.now() - start;
      clearTimeout(timeout);
      return {
        ok: true,
        latencyMs,
        detail: `status=${res.status}`,
      };
    } catch (err) {
      clearTimeout(timeout);
      const e = err as Error;
      return {
        ok: false,
        latencyMs: Date.now() - start,
        detail: e?.message ?? 'unreachable',
      };
    }
  }

  private buildUrl(request: GenerationRequest): string {
    const encoded = encodeURIComponent(request.prompt);
    const params = new URLSearchParams();
    if (request.width) params.set('width', String(request.width));
    if (request.height) params.set('height', String(request.height));
    if (request.seed !== undefined) params.set('seed', String(request.seed));
    if (request.negativePrompt) params.set('negative', encodeURIComponent(request.negativePrompt));
    const qs = params.toString();
    return `${this.baseUrl}/image/${encoded}${qs ? `?${qs}` : ''}`;
  }

  private mapNetworkError(err: unknown): ProviderError {
    const e = err as { name?: string; message?: string };
    if (e.name === 'AbortError' || e.name === 'TimeoutError' || /aborted|timeout/i.test(e.message ?? '')) {
      return Object.assign(new Error('Pollinations request timed out'), {
        code: 'PROVIDER_TIMEOUT' as const,
        provider: this.name,
      });
    }
    this.logger.error({ err }, 'Pollinations network error');
    return Object.assign(new Error('Pollinations request failed'), {
      code: 'PROVIDER_BROKEN' as const,
      provider: this.name,
    });
  }
}
