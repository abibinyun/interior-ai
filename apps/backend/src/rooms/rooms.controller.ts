import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../sessions/session.guard';
import { UpdateBriefDto } from './dto/update-brief.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
@UseGuards(SessionGuard)
export class RoomsController {
  constructor(private readonly service: RoomsService) {}

  @Get(':roomId')
  async get(@Param('roomId', new ParseUUIDPipe()) roomId: string): Promise<unknown> {
    return this.service.get(roomId);
  }

  @Put(':roomId/brief')
  @HttpCode(HttpStatus.OK)
  async updateBrief(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Body() dto: UpdateBriefDto,
  ): Promise<unknown> {
    return this.service.updateBrief(roomId, dto);
  }
}
