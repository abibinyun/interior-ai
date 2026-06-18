import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';
import { StyleProfilesRepository } from '../style-profiles/style-profiles.repository';
import { StyleProfilesService } from '../style-profiles/style-profiles.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsRepository,
    ProjectsService,
    StyleProfilesRepository,
    StyleProfilesService,
  ],
})
export class ProjectsModule {}
