export interface GenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
}

export interface GenerationResult {
  imageBuffer: Buffer;
  contentType: string;
  provider: string;
  providerGenerationId?: string;
}

export interface ProviderError extends Error {
  code: 'PROVIDER_TIMEOUT' | 'PROVIDER_REJECTED' | 'PROVIDER_BROKEN';
  provider: string;
  statusCode?: number;
}

export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof Error && 'code' in err &&
    ['PROVIDER_TIMEOUT', 'PROVIDER_REJECTED', 'PROVIDER_BROKEN'].includes((err as ProviderError).code);
}

export interface ProviderHealth {
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

export const AI_PROVIDER_ADAPTER = Symbol('AI_PROVIDER_ADAPTER');

/**
 * Provider-agnostic generation interface. The active implementation is
 * selected at boot time via `AI_PROVIDER` env (per ADR-002). Consumers
 * (M8/M9) depend on this interface, never on a concrete adapter.
 */
export interface AiProviderAdapter {
  readonly name: string;
  generate(request: GenerationRequest): Promise<GenerationResult>;
  /**
   * Lightweight reachability check used by `/api/health/ready`. Returns
   * within the adapter's short timeout and reports success/failure
   * without throwing. Optional in the interface for future adapters
   * that can't easily check reachability; the default implementation
   * reports `ok: true` with `detail: 'skipped'`.
   */
  healthcheck(): Promise<ProviderHealth>;
}
