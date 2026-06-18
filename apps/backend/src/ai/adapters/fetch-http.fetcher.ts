import { Injectable } from '@nestjs/common';
import { HttpFetcher } from './pollinations.adapter';

@Injectable()
export class FetchHttpFetcher implements HttpFetcher {
  async fetch(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal; timeoutMs: number },
  ): Promise<{ status: number; headers: Record<string, string>; body: () => Promise<Buffer> }> {
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
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
