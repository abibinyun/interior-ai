import { Module } from '@nestjs/common';
import { StylesController } from './styles.controller';

@Module({
  controllers: [StylesController],
})
export class StylesModule {}
