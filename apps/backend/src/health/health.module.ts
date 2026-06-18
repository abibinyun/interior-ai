import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma';
import { StorageModule } from '../storage/storage.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, AiModule, StorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
