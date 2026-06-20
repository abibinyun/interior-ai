import { Module } from '@nestjs/common';
import { GenerationsModule } from '../generations/generations.module';
import { PrismaModule } from '../prisma';
import { RoomsController } from './rooms.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

@Module({
  imports: [PrismaModule, GenerationsModule],
  controllers: [RoomsController],
  providers: [RoomsRepository, RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
