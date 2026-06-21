import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderAdapter, GenerationRequest, GenerationResult, ProviderError, ProviderHealth } from './ai-provider.adapter';
import { HTTP_FETCHER, HttpFetcher } from './pollinations.adapter';

/**
 * AI Horde (https://stablehorde.net/) adapter.
 *
 * AI Horde is a crowdsourced image generation API. It is **async**:
 * the client submits a job, then polls for completion. This is
 * different from the other adapters (Pollinations, Myceli) which
 * return the image bytes in a single round-trip.
 *
 * ## Flow
 * ```
 *   POST {base}/v2/generate/async   →  { id: "..." }          (submit)
 *   GET  {base}/v2/generate/status/{id}  → { done, faulted, generations?: [...] }   (poll)
 *   GET  generations[0].img       →  image bytes                                (download)
 * ```
 *
 * The `/status/{id}` endpoint is a strict superset of `/check/{id}`:
 * it returns the same `done` / `faulted` / `wait_time` / `queue_position`
 * fields AND the `generations` array with the final image URLs. We
 * use `/status` so we don't need a second round-trip after `done=true`.
 *
 * ## Authentication
 * The API key is sent in the `apikey` header (NOT a Bearer token).
 * An anonymous key is allowed but the user lands in the priority
 * "abyssal" pool with longer wait times. The key should be set via
 * `AI_HORDE_API_KEY` in `.env` (gitignored).
 *
 * ## Polling
 * We poll every 2 s up to `GENERATION_HARD_TIMEOUT_MS` (default
 * 120 s). AI Horde's `wait_time` field tells the client how long to
 * wait before the next check, but we use a fixed 2 s to keep the
 * implementation simple — the server's value is a hint, not a
 * contract.
 *
 * ## Failure modes
 * - Submit fails / 4xx (other than 429) → throw PROVIDER_REJECTED.
 * - Submit 429 → throw PROVIDER_REJECTED with statusCode 429 (the
 *   pipeline orchestrator's shouldFallback will then try Myceli).
 * - Poll times out → throw PROVIDER_TIMEOUT.
 * - Poll returns faulted=true → throw PROVIDER_REJECTED with the
 *   Horde-provided message.
 * - Image download fails → throw PROVIDER_BROKEN.
 */
@Injectable()
export class AiHordeAdapter implements AiProviderAdapter {
  readonly name = 'ai-horde';
  private readonly logger = new Logger(AiHordeAdapter.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly hardTimeoutMs: number;

  /** How often to poll the `/status` endpoint while waiting for the job. */
  private static readonly POLL_INTERVAL_MS = 5_000;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(HTTP_FETCHER) private readonly http: HttpFetcher,
  ) {
    this.baseUrl = config.get<string>(
      'AI_HORDE_BASE_URL',
      'https://stablehorde.net/api',
    );
    this.apiKey = config.get<string>('AI_HORDE_API_KEY', '');
    this.hardTimeoutMs = config.get<number>('GENERATION_HARD_TIMEOUT_MS', 90000);
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const jobId = await this.submit(request);
    const result = await this.pollUntilDone(jobId);
    return this.downloadImage(result.imgUrl, jobId);
  }

  async healthcheck(): Promise<ProviderHealth> {
    // GET /v2/status/heartbeat returns "OK" (200) when the service
    // is up. The endpoint is unauthenticated and lightweight.
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await this.http.fetch(`${this.baseUrl}/v2/status/heartbeat`, {
        method: 'GET',
        headers: {},
        signal: controller.signal,
        timeoutMs: 2000,
      });
      const latencyMs = Date.now() - start;
      clearTimeout(timeout);
      return {
        ok: res.status >= 200 && res.status < 400,
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

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  private async submit(request: GenerationRequest): Promise<string> {
    // 30s deadline for submit + retries with backoff. The overall
    // generation timeout (hardTimeoutMs) covers the full generate()
    // lifecycle; this is just for the submit step.
    const deadline = Date.now() + 30_000;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      const result = await this.trySubmitOnce(request);
      if (result.ok) return result.id;
      if (result.status !== 429) {
        throw this.makeHttpError(result.status, 'submit', result.responseRef);
      }
      // 429 — back off and retry. Floor at 5 s.
      const retryAfterRaw = result.responseRef.headers['retry-after'];
      const retryAfterSec = retryAfterRaw
        ? Math.max(5, Number(retryAfterRaw) || 5)
        : 5;
      if (Date.now() + retryAfterSec * 1000 >= deadline) {
        throw this.makeHttpError(429, 'submit', result.responseRef);
      }
      this.logger.warn(
        { attempt, retryAfterSec, deadlineRemainingSec: Math.ceil((deadline - Date.now()) / 1000) },
        'AI Horde submit rate-limited; backing off',
      );
      await this.sleep(retryAfterSec * 1000);
    }
  }

  /**
   * Single submit attempt. Returns `{ ok: true, id }` on 2xx with
   * a valid id, or `{ ok: false, status }` on any error that the
   * caller should decide whether to retry.
   */
  private async trySubmitOnce(
    request: GenerationRequest,
  ): Promise<
    | { ok: true; id: string }
    | { ok: false; status: number; responseRef: Awaited<ReturnType<HttpFetcher['fetch']>> }
  > {
    const url = `${this.baseUrl}/v2/generate/async`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiKey) headers['apikey'] = this.apiKey;

    const params: Record<string, unknown> = {};
    if (request.width) params['width'] = request.width;
    if (request.height) params['height'] = request.height;
    if (request.seed !== undefined) params['seed'] = request.seed;

    const body: Record<string, unknown> = {
      prompt: request.prompt,
      ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
      ...(Object.keys(params).length > 0 ? { params } : {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.hardTimeoutMs);
    let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
    try {
      response = await this.http.fetch(url, {
        method: 'POST',
        headers,
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
      return { ok: false, status: response.status, responseRef: response };
    }

    const text = (await response.body()).toString('utf-8');
    let parsed: { id?: string } = {};
    try {
      parsed = JSON.parse(text) as { id?: string };
    } catch {
      throw this.makeProviderBrokenError('AI Horde submit returned non-JSON body', undefined);
    }
    if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
      throw this.makeProviderBrokenError('AI Horde submit response missing id', parsed);
    }
    return { ok: true, id: parsed.id };
  }

  // -------------------------------------------------------------------------
  // Poll
  // -------------------------------------------------------------------------

  private async pollUntilDone(jobId: string): Promise<{ imgUrl: string }> {
    const deadline = Date.now() + this.hardTimeoutMs;
    // Use /v2/generate/status/{id} — it's a strict superset of /check
    // (same done/faulted fields PLUS the `generations` array with
    // image URLs), so we only need one endpoint to drive the poll.
    const url = `${this.baseUrl}/v2/generate/status/${encodeURIComponent(jobId)}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers['apikey'] = this.apiKey;

    while (Date.now() < deadline) {
      const controller = new AbortController();
      // Per-request timeout: leave 5 s of headroom under the
      // overall deadline so we always have time to surface a clean
      // PROVIDER_TIMEOUT error.
      const perRequestTimeoutMs = Math.max(5_000, Math.min(10_000, deadline - Date.now() - 5_000));
      const timeout = setTimeout(() => controller.abort(), perRequestTimeoutMs);

      let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
      try {
        response = await this.http.fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
          timeoutMs: perRequestTimeoutMs,
        });
      } catch (err) {
        clearTimeout(timeout);
        throw this.mapNetworkError(err);
      }
      clearTimeout(timeout);

      if (response.status >= 400) {
        // 429 (rate limit) during polling is transient — back off
        // and retry instead of throwing immediately. The Retry-After
        // header tells us how long to wait; floor at 5 s.
        if (response.status === 429) {
          const retryAfterRaw = response.headers['retry-after'];
          const retryAfterSec = retryAfterRaw
            ? Math.max(5, Number(retryAfterRaw) || 5)
            : 5;
          if (Date.now() + retryAfterSec * 1000 < deadline) {
            this.logger.warn(
              { jobId, retryAfterSec, deadlineRemainingSec: Math.ceil((deadline - Date.now()) / 1000) },
              'AI Horde poll rate-limited; backing off',
            );
            await this.sleep(retryAfterSec * 1000);
            continue;
          }
        }
        throw this.makeHttpError(response.status, 'poll', response);
      }

      const text = (await response.body()).toString('utf-8');
      let parsed: HordeCheckResponse = {};
      try {
        parsed = JSON.parse(text) as HordeCheckResponse;
      } catch {
        throw this.makeProviderBrokenError('AI Horde check returned non-JSON body', undefined);
      }

      if (parsed.faulted === true) {
        throw Object.assign(
          new Error(`AI Horde job faulted: ${parsed.message ?? 'no message provided'}`),
          { code: 'PROVIDER_REJECTED' as const, provider: this.name, statusCode: 422 },
        );
      }

      if (parsed.done === true) {
        const imgUrl = parsed.generations?.[0]?.img;
        if (typeof imgUrl !== 'string' || imgUrl.length === 0) {
          throw this.makeProviderBrokenError(
            'AI Horde job done but no image URL in response',
            parsed,
          );
        }
        return { imgUrl };
      }

      // Not done yet — sleep and retry.
      await this.sleep(AiHordeAdapter.POLL_INTERVAL_MS);
    }

    // Deadline elapsed.
    throw Object.assign(new Error('AI Horde job did not complete within hard timeout'), {
      code: 'PROVIDER_TIMEOUT' as const,
      provider: this.name,
    });
  }

  // -------------------------------------------------------------------------
  // Download
  // -------------------------------------------------------------------------

  private async downloadImage(imgUrl: string, jobId: string): Promise<GenerationResult> {
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
      throw this.makeHttpError(response.status, 'download', response);
    }

    const contentType = response.headers['content-type'] ?? 'image/png';
    if (!contentType.startsWith('image/')) {
      throw Object.assign(
        new Error(`AI Horde returned non-image content-type: ${contentType}`),
        { code: 'PROVIDER_BROKEN' as const, provider: this.name },
      );
    }

    const imageBuffer = await response.body();
    this.logger.log(
      { jobId, bytes: imageBuffer.length, contentType, provider: this.name },
      'ai-horde download complete',
    );
    return { imageBuffer, contentType, provider: this.name };
  }

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  private makeHttpError(
    status: number,
    phase: 'submit' | 'poll' | 'download',
    _response: { body: () => Promise<Buffer> },
  ): ProviderError {
    void _response;
    // We deliberately don't read the body here to keep the error path
    // sync; the upstream pipeline only needs the status code to
    // decide whether to fallback.
    if (status >= 500) {
      return Object.assign(new Error(`AI Horde ${phase} server error ${status}`), {
        code: 'PROVIDER_BROKEN' as const,
        provider: this.name,
        statusCode: status,
      });
    }
    return Object.assign(new Error(`AI Horde ${phase} returned ${status}`), {
      code: 'PROVIDER_REJECTED' as const,
      provider: this.name,
      statusCode: status,
    });
  }

  private makeProviderBrokenError(message: string, _ctx: unknown): ProviderError {
    void _ctx;
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
      return Object.assign(new Error('AI Horde request timed out'), {
        code: 'PROVIDER_TIMEOUT' as const,
        provider: this.name,
      });
    }
    this.logger.error({ err }, 'AI Horde network error');
    return Object.assign(new Error('AI Horde request failed'), {
      code: 'PROVIDER_BROKEN' as const,
      provider: this.name,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

interface HordeCheckResponse {
  done?: boolean;
  faulted?: boolean;
  message?: string;
  generations?: Array<{ img?: string }>;
}
