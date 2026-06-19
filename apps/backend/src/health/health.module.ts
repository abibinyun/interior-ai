import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma';
import { StorageModule } from '../storage/storage.module';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsMiddleware } from './metrics.middleware';

@Module({
  imports: [PrismaModule, AiModule, StorageModule],
  controllers: [HealthController, MetricsController],
})
export class HealthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
