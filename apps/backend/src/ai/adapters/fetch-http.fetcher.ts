import { Injectable } from '@nestjs/common';
import { HttpFetcher } from './pollinations.adapter';

@Injectable()
export class FetchHttpFetcher implements HttpFetcher {
  async fetch(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      // `BodyInit` covers string | Uint8Array | FormData | etc. We
      // declare the shape loosely here because undici's types are
      // stricter than ours — and we accept Buffer for binary uploads.
      body?: string | Uint8Array | Buffer;
      signal: AbortSignal;
      timeoutMs: number;
    },
  ): Promise<{ status: number; headers: Record<string, string>; body: () => Promise<Buffer> }> {
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      // Buffer extends Uint8Array which the global `fetch` accepts as
      // a BodyInit. The Node 18+ types are stricter than the runtime,
      // so we cast to BodyInit to satisfy TS.
      body: init.body as BodyInit | null | undefined,
      signal: init.signal,
    });

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      headers,
      body: async (): Promise<Buffer> => {
        const ab = await response.arrayBuffer();
        return Buffer.from(ab);
      },
    };
  }
}
