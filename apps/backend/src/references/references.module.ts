import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ReferencesController } from './references.controller';
import { ReferencesRepository } from './references.repository';
import { ReferencesService } from './references.service';

@Module({
  imports: [StorageModule],
  controllers: [ReferencesController],
  providers: [ReferencesRepository, ReferencesService],
  exports: [ReferencesService],
})
export class ReferencesModule {}
