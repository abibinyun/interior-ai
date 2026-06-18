import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PRISMA_LOG_LEVEL, PRISMA_LOG_EVENTS } from './prisma.tokens';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ConfigService) configService: ConfigService) {
    const isDev = configService.get<string>('NODE_ENV') === 'development';
    super({
      log: isDev
        ? [
            { level: PRISMA_LOG_LEVEL.QUERY, emit: PRISMA_LOG_EVENTS.EVENT },
            { level: PRISMA_LOG_LEVEL.WARN, emit: PRISMA_LOG_EVENTS.STDOUT },
            { level: PRISMA_LOG_LEVEL.ERROR, emit: PRISMA_LOG_EVENTS.STDOUT },
          ]
        : [
            { level: PRISMA_LOG_LEVEL.WARN, emit: PRISMA_LOG_EVENTS.STDOUT },
            { level: PRISMA_LOG_LEVEL.ERROR, emit: PRISMA_LOG_EVENTS.STDOUT },
          ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
