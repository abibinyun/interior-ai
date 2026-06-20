import { Module } from '@nestjs/common';
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
      useFactory: (config: ConfigService): { max: number; windowMs: number; name: string } => {
        if (config.get<boolean>('RATE_LIMIT_DISABLED', false)) {
          return { max: Number.MAX_SAFE_INTEGER, windowMs: 60_000, name: 'generations' };
        }
        return {
          max: config.get<number>('RATE_LIMIT_GENERATIONS_PER_MIN', 5),
          windowMs: 60_000,
          name: 'generations',
        };
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
  exports: [GenerationsService, RateLimitGuard],
})
export class GenerationsModule {}
