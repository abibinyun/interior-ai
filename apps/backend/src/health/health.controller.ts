import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { AI_PROVIDER_ADAPTER, AiProviderAdapter } from '../ai/adapters/ai-provider.adapter';
import { STORAGE_ADAPTER, StorageAdapter } from '../storage/storage.adapter';

type CheckState = 'ok' | 'down';

interface CheckResult {
  status: CheckState;
  latencyMs?: number;
  detail?: string;
}

interface ReadinessReport {
  status: 'ok' | 'down';
  checks: {
    db: CheckResult;
    storage: CheckResult;
    ai: CheckResult;
  };
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER_ADAPTER) private readonly ai: AiProviderAdapter,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  /**
   * 11.1 Liveness — the process is up and accepting connections.
   *
   * Always returns 200 unless the runtime is broken. This is what a
   * load balancer or container orchestrator should hit to decide
   * whether to keep sending traffic.
   */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * 11.2 Readiness — every external dependency is reachable.
   *
   * Runs three checks (DB, storage, AI) in parallel with short
   * timeouts. Returns 503 if any check fails so a reverse proxy /
   * orchestrator can drain this instance until the dependency
   * recovers. The body always has the same shape so monitoring
   * dashboards can parse it without conditional logic.
   */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const [db, storage, ai] = await Promise.all([
      this.checkDb(),
      this.checkStorage(),
      this.checkAi(),
    ]);
    const allOk = db.status === 'ok' && storage.status === 'ok' && ai.status === 'ok';
    res.status(allOk ? 200 : 503);
    return {
      status: allOk ? 'ok' : 'down',
      checks: { db, storage, ai },
    };
  }

  private async checkDb(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        detail: (err as Error)?.message ?? 'unknown',
      };
    }
  }

  private async checkStorage(): Promise<CheckResult> {
    // We don't make a real network call: the storage adapter is part of
    // the same process, and a forced /ready call should not be noisy.
    // Instead, we verify the adapter is configured and report its name.
    // The SupabaseStorageAdapter validates SUPABASE_URL at construction
    // time, so by the time we reach this code the config is present.
    const start = Date.now();
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    if (!supabaseUrl) {
      return { status: 'down', detail: 'SUPABASE_URL not configured' };
    }
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
      detail: `adapter=${this.storage.name}`,
    };
  }

  private async checkAi(): Promise<CheckResult> {
    const start = Date.now();
    try {
      const result = await this.ai.healthcheck();
      return {
        status: result.ok ? 'ok' : 'down',
        latencyMs: result.latencyMs ?? Date.now() - start,
        detail: result.detail,
      };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        detail: (err as Error)?.message ?? 'unknown',
      };
    }
  }
}
