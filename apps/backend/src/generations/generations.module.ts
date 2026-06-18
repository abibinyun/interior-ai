import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { GenerationsController } from './generations.controller';
import { GenerationsRepository } from './generations.repository';
import { GenerationsService } from './generations.service';
import { PromptComposer } from './prompt-composer';

@Module({
  imports: [PrismaModule],
  controllers: [GenerationsController],
  providers: [GenerationsRepository, GenerationsService, PromptComposer],
  exports: [GenerationsService],
})
export class GenerationsModule {}
