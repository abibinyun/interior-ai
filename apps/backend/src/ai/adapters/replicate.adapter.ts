import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderAdapter, GenerationRequest, GenerationResult, ProviderError, ProviderHealth } from './ai-provider.adapter';
import { HTTP_FETCHER, HttpFetcher } from './pollinations.adapter';

/**
 * Replicate adapter (https://replicate.com/).
 *
 * Replicate is an async prediction API: submit a job, poll for
 * completion, download the result. The active model is
 * configurable via `REPLICATE_MODEL` env (default
 * `black-forest-labs/flux-2-pro`).
 *
 * ## Flow
 * ```
 *   POST {base}/v1/models/{model}/predictions  → { id, status: "starting" }
 *   GET  {base}/v1/predictions/{id}            → { status, output? }
 *   GET  output[0]                             → image bytes
 * ```
 *
 * ## Authentication
 * `Authorization: Token ${REPLICATE_API_KEY}` (Replicate uses
 * "Token" not "Bearer").
 *
 * ## Polling
 * Poll every 2 s up to GENERATION_HARD_TIMEOUT_MS. Replicate's
 * `/predictions/{id}` endpoint is a cheap GET — no separate rate
 * limit concerns like AI Horde's status endpoint.
 */

@Injectable()
export class ReplicateAdapter implements AiProviderAdapter {
  readonly name = 'replicate';
  private readonly logger = new Logger(ReplicateAdapter.name);
  private readonly baseUrl = 'https://api.replicate.com';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly hardTimeoutMs: number;

  private static readonly POLL_INTERVAL_MS = 2_000;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(HTTP_FETCHER) private readonly http: HttpFetcher,
  ) {
    this.apiKey = config.get<string>('REPLICATE_API_KEY', '');
    this.model = config.get<string>(
      'REPLICATE_MODEL',
      'black-forest-labs/flux-2-pro',
    );
    this.hardTimeoutMs = config.get<number>('GENERATION_HARD_TIMEOUT_MS', 120_000);
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const predictionId = await this.submit(request);
    const imgUrl = await this.pollUntilDone(predictionId);
    return this.downloadImage(imgUrl, predictionId);
  }

  async healthcheck(): Promise<ProviderHealth> {
    // GET /v1/models/{model} returns model info. 2xx proves
    // reachability + valid API key.
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const res = await this.http.fetch(
        `${this.baseUrl}/v1/models/${this.model}`,
        {
          method: 'GET',
          headers: this.authHeaders({ Accept: 'application/json' }),
          signal: controller.signal,
          timeoutMs: 2_000,
        },
      );
      const latencyMs = Date.now() - start;
      clearTimeout(timeout);
      return { ok: res.status >= 200 && res.status < 400, latencyMs, detail: `status=${res.status}` };
    } catch (err) {
      clearTimeout(timeout);
      const e = err as Error;
      return { ok: false, latencyMs: Date.now() - start, detail: e?.message ?? 'unreachable' };
    }
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  private async submit(request: GenerationRequest): Promise<string> {
    const url = `${this.baseUrl}/v1/models/${this.model}/predictions`;
    const body: Record<string, unknown> = {
      input: {
        prompt: request.prompt,
        output_format: 'png',
        output_quality: 90,
        safety_tolerance: 5,
      },
    };
    // Optional: add negative prompt? Flux doesn't do negative prompts.
    // We skip it.
    if (request.width || request.height) {
      (body.input as Record<string, unknown>)['width'] = request.width;
      (body.input as Record<string, unknown>)['height'] = request.height;
    }
    if (request.seed !== undefined) {
      (body.input as Record<string, unknown>)['seed'] = request.seed;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.hardTimeoutMs);
    let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
    try {
      response = await this.http.fetch(url, {
        method: 'POST',
        headers: {
          ...this.authHeaders({}),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        timeoutMs: this.hardTimeoutMs,
      });
    } catch (err) {
      clearTimeout(timeout);
      throw this.mapNetworkError(err);
    }
    clearTimeout(timeout);

    if (response.status >= 400) {
      throw this.makeHttpError(response.status, 'submit');
    }

    const text = (await response.body()).toString('utf-8');
    let parsed: { id?: string } = {};
    try {
      parsed = JSON.parse(text) as { id?: string };
    } catch {
      throw this.makeProviderBrokenError('Replicate submit returned non-JSON');
    }
    if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
      throw this.makeProviderBrokenError('Replicate submit response missing id');
    }
    return parsed.id;
  }

  // -------------------------------------------------------------------------
  // Poll
  // -------------------------------------------------------------------------

  private async pollUntilDone(predictionId: string): Promise<string> {
    const deadline = Date.now() + this.hardTimeoutMs;
    const url = `${this.baseUrl}/v1/predictions/${encodeURIComponent(predictionId)}`;

    while (Date.now() < deadline) {
      const perRequestTimeoutMs = Math.max(
        5_000,
        Math.min(10_000, deadline - Date.now() - 5_000),
      );
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), perRequestTimeoutMs);

      let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
      try {
        response = await this.http.fetch(url, {
          method: 'GET',
          headers: this.authHeaders({ Accept: 'application/json' }),
          signal: controller.signal,
          timeoutMs: perRequestTimeoutMs,
        });
      } catch (err) {
        clearTimeout(timeout);
        throw this.mapNetworkError(err);
      }
      clearTimeout(timeout);

      if (response.status >= 400) {
        throw this.makeHttpError(response.status, 'poll');
      }

      const text = (await response.body()).toString('utf-8');
      let parsed: { status?: string; output?: unknown; error?: string } = {};
      try {
        parsed = JSON.parse(text) as { status?: string; output?: unknown };
      } catch {
        throw this.makeProviderBrokenError('Replicate poll returned non-JSON');
      }

      if (parsed.status === 'failed') {
        throw Object.assign(
          new Error(`Replicate prediction failed: ${parsed.error ?? 'unknown error'}`),
          { code: 'PROVIDER_REJECTED' as const, provider: this.name, statusCode: 422 },
        );
      }

      if (parsed.status === 'canceled') {
        throw Object.assign(new Error('Replicate prediction was canceled'), {
          code: 'PROVIDER_REJECTED' as const,
          provider: this.name,
          statusCode: 410,
        });
      }

      if (parsed.status === 'succeeded') {
        const output = parsed.output;
        // Replicate output is either a string (single image URL) or
        // an array of strings. We take the first one.
        const imgUrl = Array.isArray(output)
          ? (output[0] as string | undefined)
          : (output as string | undefined);
        if (typeof imgUrl !== 'string' || imgUrl.length === 0) {
          throw this.makeProviderBrokenError(
            'Replicate prediction succeeded but no image URL in output',
          );
        }
        return imgUrl;
      }

      // status = "starting" or "processing"
      await this.sleep(ReplicateAdapter.POLL_INTERVAL_MS);
    }

    throw Object.assign(new Error('Replicate prediction did not complete within hard timeout'), {
      code: 'PROVIDER_TIMEOUT' as const,
      provider: this.name,
    });
  }

  // -------------------------------------------------------------------------
  // Download
  // -------------------------------------------------------------------------

  private async downloadImage(
    imgUrl: string,
    predictionId: string,
  ): Promise<GenerationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.hardTimeoutMs);
    let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
    try {
      response = await this.http.fetch(imgUrl, {
        method: 'GET',
        headers: {},
        signal: controller.signal,
        timeoutMs: this.hardTimeoutMs,
      });
    } catch (err) {
      clearTimeout(timeout);
      throw this.mapNetworkError(err);
    }
    clearTimeout(timeout);

    if (response.status >= 400) {
      throw this.makeHttpError(response.status, 'download');
    }

    const contentType = response.headers['content-type'] ?? 'image/png';
    if (!contentType.startsWith('image/')) {
      throw Object.assign(
        new Error(`Replicate returned non-image content-type: ${contentType}`),
        { code: 'PROVIDER_BROKEN' as const, provider: this.name },
      );
    }

    const imageBuffer = await response.body();
    this.logger.log(
      { predictionId, bytes: imageBuffer.length, contentType, provider: this.name },
      'replicate download complete',
    );
    return { imageBuffer, contentType, provider: this.name };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private authHeaders(extra: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this.apiKey) h['Authorization'] = `Token ${this.apiKey}`;
    return h;
  }

  private makeHttpError(status: number, phase: string): ProviderError {
    const code =
      status >= 500 ? ('PROVIDER_BROKEN' as const) : ('PROVIDER_REJECTED' as const);
    return Object.assign(new Error(`Replicate ${phase} returned ${status}`), {
      code,
      provider: this.name,
      statusCode: status,
    });
  }

  private makeProviderBrokenError(message: string): ProviderError {
    return Object.assign(new Error(message), {
      code: 'PROVIDER_BROKEN' as const,
      provider: this.name,
    });
  }

  private mapNetworkError(err: unknown): ProviderError {
    const e = err as { name?: string; message?: string };
    if (
      e.name === 'AbortError' ||
      e.name === 'TimeoutError' ||
      /aborted|timeout/i.test(e.message ?? '')
    ) {
      return Object.assign(new Error('Replicate request timed out'), {
        code: 'PROVIDER_TIMEOUT' as const,
        provider: this.name,
      });
    }
    this.logger.error({ err }, 'Replicate network error');
    return Object.assign(new Error('Replicate request failed'), {
      code: 'PROVIDER_BROKEN' as const,
      provider: this.name,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
