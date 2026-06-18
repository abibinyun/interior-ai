import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../sessions/session.guard';
import { GenerationsService } from './generations.service';

@Controller('generations')
@UseGuards(SessionGuard)
export class GenerationsLineageController {
  constructor(private readonly service: GenerationsService) {}

  @Get(':generationId/lineage')
  async lineage(
    @Param('generationId', new ParseUUIDPipe()) generationId: string,
  ): Promise<unknown> {
    return this.service.getLineage(generationId);
  }
}
