import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MAX_UPLOAD_BYTES,
  SignedUrlResult,
  StorageAdapter,
  StorageError,
  UploadRequest,
  UploadResult,
} from './storage.adapter';
import { HTTP_FETCHER, HttpFetcher } from '../ai/adapters/pollinations.adapter';

@Injectable()
export class SupabaseStorageAdapter implements StorageAdapter {
  readonly name = 'supabase';
  private readonly logger = new Logger(SupabaseStorageAdapter.name);
  private readonly supabaseUrl: string | undefined;
  private readonly serviceKey: string;
  private readonly bucket: string;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(HTTP_FETCHER) private readonly http: HttpFetcher,
  ) {
    this.supabaseUrl = config.get<string>('SUPABASE_URL');
    this.serviceKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY', '');
    this.bucket = config.get<string>('SUPABASE_STORAGE_BUCKET', 'generations');
  }

  async upload(request: UploadRequest): Promise<UploadResult> {
    if (!this.supabaseUrl) {
      throw this.makeError('STORAGE_FAILED', 'SUPABASE_URL is not configured', undefined, undefined);
    }
    if (request.body.length > MAX_UPLOAD_BYTES) {
      throw this.makeError('UPLOAD_REJECTED', `Upload exceeds maximum size of ${MAX_UPLOAD_BYTES} bytes`, request.key, undefined);
    }
    // MIME validation is the responsibility of the caller:
    //   - ReferencesService validates image/jpeg|png|webp + size (rule SG-06)
    //   - GenerationsService validates the AI provider's response MIME
    //   - ExportsService uses application/zip for the bundle
    // The storage layer is intentionally permissive — Supabase's bucket
    // accepts arbitrary content types as long as we send the right one.
    if (!request.contentType || request.contentType.length > 200) {
      throw this.makeError(
        'UPLOAD_REJECTED',
        `Invalid content-type: ${JSON.stringify(request.contentType)}`,
        request.key,
        undefined,
      );
    }

    const url = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${request.key}`;
    const headers: Record<string, string> = {
      'Content-Type': request.contentType,
      Authorization: `Bearer ${this.serviceKey}`,
      'x-upsert': request.upsert ? 'true' : 'false',
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
    try {
      response = await this.http.fetch(url, {
        method: 'POST',
        headers,
        // Send raw bytes (Node Buffer). The fetcher base64-encodes
        // string bodies on the wire; passing a Buffer ensures the
        // underlying fetch gets the raw byte stream so Supabase stores
        // the actual binary (and the response body is also raw bytes
        // when re-fetched).
        body: request.body,
        signal: controller.signal,
        timeoutMs: 30000,
      });
    } catch (err) {
      clearTimeout(timeout);
      const e = err as { name?: string; message?: string };
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        throw this.makeError('STORAGE_FAILED', 'Supabase upload timed out', request.key, undefined);
      }
      this.logger.error({ err, key: request.key }, 'Supabase upload network error');
      throw this.makeError('STORAGE_FAILED', 'Supabase upload network error', request.key, undefined);
    }
    clearTimeout(timeout);

    if (response.status >= 400) {
      throw this.makeError(
        response.status >= 500 ? 'STORAGE_FAILED' : 'UPLOAD_REJECTED',
        `Supabase upload returned ${response.status}`,
        request.key,
        response.status,
      );
    }

    const publicUrl = this.buildPublicUrl(request.key);
    return { key: request.key, publicUrl };
  }

  async download(key: string): Promise<Buffer> {
    if (!this.supabaseUrl) {
      throw this.makeError('STORAGE_FAILED', 'SUPABASE_URL is not configured', key, undefined);
    }
    const url = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${key}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.serviceKey}`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
    try {
      response = await this.http.fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        timeoutMs: 30000,
      });
    } catch (err) {
      clearTimeout(timeout);
      this.logger.error({ err, key }, 'Supabase download network error');
      throw this.makeError('STORAGE_FAILED', 'Supabase download network error', key, undefined);
    }
    clearTimeout(timeout);

    if (response.status === 404) {
      throw this.makeError('STORAGE_FAILED', `Object not found: ${key}`, key, 404);
    }
    if (response.status >= 400) {
      throw this.makeError('STORAGE_FAILED', `Supabase download returned ${response.status}`, key, response.status);
    }

    return await response.body();
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<SignedUrlResult> {
    if (!this.supabaseUrl) {
      throw this.makeError('STORAGE_FAILED', 'SUPABASE_URL is not configured', key, undefined);
    }
    const url = `${this.supabaseUrl}/storage/v1/object/sign/${this.bucket}/${key}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.serviceKey}`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
    try {
      response = await this.http.fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expiresIn: ttlSeconds }),
        signal: controller.signal,
        timeoutMs: 15000,
      });
    } catch (err) {
      clearTimeout(timeout);
      this.logger.error({ err, key }, 'Supabase signed-url network error');
      throw this.makeError('STORAGE_FAILED', 'Supabase signed-url network error', key, undefined);
    }
    clearTimeout(timeout);

    if (response.status >= 400) {
      throw this.makeError('STORAGE_FAILED', `Supabase signed-url returned ${response.status}`, key, response.status);
    }

    const body = await response.body();
    const parsed = JSON.parse(body.toString('utf8')) as { signedURL?: string };
    if (!parsed.signedURL) {
      throw this.makeError('STORAGE_FAILED', 'Supabase signed-url response missing signedURL', key, response.status);
    }
    const signedUrl = parsed.signedURL.startsWith('http')
      ? parsed.signedURL
      : `${this.supabaseUrl}${parsed.signedURL}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    return { key, signedUrl, expiresAt };
  }

  async delete(key: string): Promise<void> {
    if (!this.supabaseUrl) {
      throw this.makeError('STORAGE_FAILED', 'SUPABASE_URL is not configured', key, undefined);
    }
    const url = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${key}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.serviceKey}`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Awaited<ReturnType<HttpFetcher['fetch']>>;
    try {
      response = await this.http.fetch(url, {
        method: 'DELETE',
        headers,
        signal: controller.signal,
        timeoutMs: 15000,
      });
    } catch (err) {
      clearTimeout(timeout);
      this.logger.error({ err, key }, 'Supabase delete network error');
      throw this.makeError('STORAGE_FAILED', 'Supabase delete network error', key, undefined);
    }
    clearTimeout(timeout);

    if (response.status >= 400 && response.status !== 404) {
      throw this.makeError('STORAGE_FAILED', `Supabase delete returned ${response.status}`, key, response.status);
    }
  }

  private buildPublicUrl(key: string): string {
    return `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${key}`;
  }

  private makeError(code: StorageError['code'], message: string, key: string | undefined, statusCode: number | undefined): StorageError {
    return Object.assign(new Error(message), { code, key, statusCode });
  }
}
