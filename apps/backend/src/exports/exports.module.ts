import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { ProjectsModule } from '../projects/projects.module';
import { StorageModule } from '../storage/storage.module';
import { ExportsController } from './exports.controller';
import { ExportsRepository } from './exports.repository';
import { ExportsService } from './exports.service';

@Module({
  imports: [PrismaModule, ProjectsModule, StorageModule],
  controllers: [ExportsController],
  providers: [ExportsRepository, ExportsService],
})
export class ExportsModule {}
