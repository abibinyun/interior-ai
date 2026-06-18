import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../sessions/session.guard';
import { ExportsService } from './exports.service';

@Controller()
@UseGuards(SessionGuard)
export class ExportsController {
  constructor(@Inject(ExportsService) private readonly service: ExportsService) {}

  /**
   * 10.1 Create Export Bundle
   *
   * POST /api/projects/:projectId/exports
   */
  @Post('projects/:projectId/exports')
  @HttpCode(201)
  async create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<unknown> {
    return this.service.create(projectId);
  }

  /**
   * 10.2 List Export Bundles
   *
   * GET /api/projects/:projectId/exports
   */
  @Get('projects/:projectId/exports')
  async list(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<{ items: unknown[] }> {
    return this.service.listByProjectId(projectId);
  }

  /**
   * 10.3 Get Export Bundle Metadata
   *
   * GET /api/exports/:bundleId
   */
  @Get('exports/:bundleId')
  async getOne(
    @Param('bundleId', new ParseUUIDPipe()) bundleId: string,
  ): Promise<unknown> {
    return this.service.getById(bundleId);
  }
}
