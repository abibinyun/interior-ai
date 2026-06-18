import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderAdapter, GenerationRequest, GenerationResult, ProviderError } from './ai-provider.adapter';
import { HTTP_FETCHER, HttpFetcher } from './pollinations.adapter';

@Injectable()
export class MyceliAdapter implements AiProviderAdapter {
  readonly name = 'myceli';
  private readonly logger = new Logger(MyceliAdapter.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly hardTimeoutMs: number;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(HTTP_FETCHER) private readonly http: HttpFetcher,
  ) {
    this.baseUrl = config.get<string>('AI_FALLBACK_BASE_URL', 'https://api.myceli.ai');
    this.apiKey = config.get<string>('AI_FALLBACK_API_KEY', '');
    this.hardTimeoutMs = config.get<number>('GENERATION_HARD_TIMEOUT_MS', 90000);
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const url = `${this.baseUrl}/v1/generate`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'image/png',
    };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.hardTimeoutMs);

    const body = JSON.stringify({
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      width: request.width,
      height: request.height,
      seed: request.seed,
    });

    let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
    try {
      response = await this.http.fetch(url, {
        method: 'POST',
        headers,
        body,
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
        new Error(`Myceli returned ${response.status}`),
        { code: 'PROVIDER_REJECTED' as const, provider: this.name, statusCode: response.status },
      );
      throw err;
    }

    if (response.status >= 500) {
      const err: ProviderError = Object.assign(
        new Error(`Myceli server error ${response.status}`),
        { code: 'PROVIDER_BROKEN' as const, provider: this.name, statusCode: response.status },
      );
      throw err;
    }

    const contentType = response.headers['content-type'] ?? 'image/png';
    if (!contentType.startsWith('image/')) {
      const err: ProviderError = Object.assign(
        new Error(`Myceli returned non-image content-type: ${contentType}`),
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

  private mapNetworkError(err: unknown): ProviderError {
    const e = err as { name?: string; message?: string };
    if (e.name === 'AbortError' || e.name === 'TimeoutError' || /aborted|timeout/i.test(e.message ?? '')) {
      return Object.assign(new Error('Myceli request timed out'), {
        code: 'PROVIDER_TIMEOUT' as const,
        provider: this.name,
      });
    }
    this.logger.error({ err }, 'Myceli network error');
    return Object.assign(new Error('Myceli request failed'), {
      code: 'PROVIDER_BROKEN' as const,
      provider: this.name,
    });
  }
}
