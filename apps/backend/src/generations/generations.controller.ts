import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../sessions/session.guard';
import { StartBatchDto } from './dto/start-batch.dto';
import { GenerationsService } from './generations.service';

@Controller('rooms')
@UseGuards(SessionGuard)
export class GenerationsController {
  constructor(private readonly service: GenerationsService) {}

  @Post(':roomId/generations')
  @HttpCode(HttpStatus.CREATED)
  async start(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Body() dto: StartBatchDto,
  ): Promise<unknown> {
    return this.service.startBatch(roomId, dto);
  }

  @Get(':roomId/generations')
  async listByRoom(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
  ): Promise<{ items: unknown[] }> {
    const items = await this.service.listByRoomId(roomId);
    return { items };
  }
}
