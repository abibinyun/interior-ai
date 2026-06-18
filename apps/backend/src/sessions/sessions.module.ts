import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { SessionContext } from './session.context';
import { SessionGuard } from './session.guard';
import { SessionsController } from './sessions.controller';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [SessionsController],
  providers: [
    SessionContext,
    SessionGuard,
    SessionsRepository,
    SessionsService,
  ],
  exports: [SessionContext, SessionGuard, SessionsService],
})
export class SessionsModule {}
