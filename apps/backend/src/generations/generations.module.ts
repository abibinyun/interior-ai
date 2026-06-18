import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma';
import { StorageModule } from '../storage/storage.module';
import { AnchorBuilder } from './anchor-builder';
import { GenerationsController } from './generations.controller';
import { GenerationsLineageController } from './generations-lineage.controller';
import { GenerationsRepository } from './generations.repository';
import { GenerationsService } from './generations.service';
import { PipelineOrchestrator } from './pipeline-orchestrator';
import { PromptComposer } from './prompt-composer';

@Module({
  imports: [PrismaModule, AiModule, StorageModule],
  controllers: [GenerationsController, GenerationsLineageController],
  providers: [
    AnchorBuilder,
    GenerationsRepository,
    GenerationsService,
    PromptComposer,
    PipelineOrchestrator,
  ],
  exports: [GenerationsService],
})
export class GenerationsModule {}
