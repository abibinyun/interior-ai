import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { RoomsModule } from '../rooms/rooms.module';
import { StyleProfilesRepository } from '../style-profiles/style-profiles.repository';
import { StyleProfilesService } from '../style-profiles/style-profiles.service';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  imports: [PrismaModule, RoomsModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsRepository,
    ProjectsService,
    StyleProfilesRepository,
    StyleProfilesService,
  ],
  exports: [ProjectsRepository],
})
export class ProjectsModule {}
