import { Module, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma';
import { RATE_LIMIT_CONFIG, RateLimitGuard } from '../common/rate-limit.guard';
import { StorageModule } from '../storage/storage.module';
import { AnchorBuilder } from './anchor-builder';
import { GenerationsController } from './generations.controller';
import { GenerationsLineageController } from './generations-lineage.controller';
import { ImagesController } from './images.controller';
import { GenerationsRepository } from './generations.repository';
import { GenerationsService } from './generations.service';
import { PipelineOrchestrator } from './pipeline-orchestrator';
import { PromptComposer } from './prompt-composer';

@Module({
  imports: [PrismaModule, AiModule, StorageModule],
  controllers: [GenerationsController, GenerationsLineageController, ImagesController],
  providers: [
    AnchorBuilder,
    GenerationsRepository,
    GenerationsService,
    PromptComposer,
    PipelineOrchestrator,
    {
      provide: RATE_LIMIT_CONFIG,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService,
      ): { max: number; windowMs: number; name: string } => {
        // Disabled mode (used by tests). `Number.MAX_SAFE_INTEGER` is
        // an effective bypass — the guard never trips.
        if (config.get<boolean>('RATE_LIMIT_DISABLED', false)) {
          const log = new Logger('RateLimitConfig');
          log.warn('RATE_LIMIT_DISABLED=true — guard will not trip');
          return { max: Number.MAX_SAFE_INTEGER, windowMs: 60_000, name: 'generations' };
        }
        // Read both knobs from env. `RATE_LIMIT_GENERATIONS_WINDOW_MS`
        // is the window length in ms; we surface it in the boot log
        // alongside `max` so operators can confirm the active
        // configuration at startup.
        const max = config.get<number>('RATE_LIMIT_GENERATIONS_MAX', 5);
        const windowMs = config.get<number>('RATE_LIMIT_GENERATIONS_WINDOW_MS', 60_000);
        const log = new Logger('RateLimitConfig');
        log.log(
          `generations limiter: max=${max} per ${windowMs}ms (~${(windowMs / 1000).toFixed(0)}s window)`,
        );
        return { max, windowMs, name: 'generations' };
      },
    },
    {
      provide: RateLimitGuard,
      useFactory: (options: { max: number; windowMs: number; name: string }) =>
        new RateLimitGuard(options),
      inject: [RATE_LIMIT_CONFIG],
    },
    {
      // Global rate limit. The guard returns true when there's no
      // session cookie AND no IP (defensive), so unauthenticated
      // public routes are unaffected.
      provide: APP_GUARD,
      useExisting: RateLimitGuard,
    },
  ],
  exports: [AnchorBuilder, GenerationsService, RateLimitGuard],
})
export class GenerationsModule {}
