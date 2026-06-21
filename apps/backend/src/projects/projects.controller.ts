import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RoomsService } from '../rooms/rooms.service';
import { CreateRoomDto } from '../rooms/dto/create-room.dto';
import { SessionGuard } from '../sessions/session.guard';
import { SetStyleProfileDto } from '../style-profiles/dto/set-style-profile.dto';
import { StyleProfilesService } from '../style-profiles/style-profiles.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(
    private readonly service: ProjectsService,
    private readonly styles: StyleProfilesService,
    private readonly rooms: RoomsService,
  ) {}

  @Get()
  async list(): Promise<{ items: unknown[] }> {
    return this.service.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateProjectDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Get(':projectId')
  async get(@Param('projectId', new ParseUUIDPipe()) projectId: string): Promise<unknown> {
    return this.service.get(projectId);
  }

  @Patch(':projectId')
  async update(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<unknown> {
    return this.service.update(projectId, dto);
  }

  @Post(':projectId/complete')
  async complete(@Param('projectId', new ParseUUIDPipe()) projectId: string): Promise<unknown> {
    return this.service.complete(projectId);
  }

  @Post(':projectId/reopen')
  async reopen(@Param('projectId', new ParseUUIDPipe()) projectId: string): Promise<unknown> {
    return this.service.reopen(projectId);
  }

  @Get(':projectId/style')
  async getStyle(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    // Bypass NestJS's response transformer: with `transform: true` on
    // the global ValidationPipe, returning `null` gets mangled into
    // an empty object by `plainToClass`. Sending the response
    // manually here means the body is the literal JSON `null` (4
    // bytes), which the frontend's `getProjectStyle` parses
    // correctly. Returning `void` + sending via `@Res` keeps the
    // rest of the controller untouched.
    const profile = await this.styles.get(projectId);
    res.status(200).json(profile);
  }

  @Put(':projectId/style')
  @HttpCode(HttpStatus.OK)
  async setStyle(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: SetStyleProfileDto,
  ): Promise<unknown> {
    return this.styles.set(projectId, dto);
  }

  @Get(':projectId/rooms')
  async listRooms(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<{ items: unknown[] }> {
    return this.rooms.listByProject(projectId);
  }

  @Post(':projectId/rooms')
  @HttpCode(HttpStatus.CREATED)
  async createRoom(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: CreateRoomDto,
  ): Promise<unknown> {
    return this.rooms.create(projectId, dto);
  }
}
