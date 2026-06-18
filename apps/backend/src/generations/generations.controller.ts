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
import { ApproveDto } from './dto/approve.dto';
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

  @Get(':roomId/generations/batches/:batchId')
  async getBatch(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ): Promise<{ batchId: string; items: unknown[] }> {
    const items = await this.service.listByBatchIdInRoom(roomId, batchId);
    return { batchId, items };
  }

  @Post(':roomId/approval')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Body() dto: ApproveDto,
  ): Promise<unknown> {
    return this.service.approve(roomId, dto.generationId);
  }

  @Post(':roomId/reopen')
  @HttpCode(HttpStatus.OK)
  async reopen(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
  ): Promise<unknown> {
    return this.service.reopenRoom(roomId);
  }
}
