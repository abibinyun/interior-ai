import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { RoomsController } from './rooms.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

@Module({
  imports: [PrismaModule],
  controllers: [RoomsController],
  providers: [RoomsRepository, RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
