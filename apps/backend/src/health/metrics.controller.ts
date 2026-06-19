import { Controller, Get, Header } from '@nestjs/common';
import { getMetrics } from './metrics-registry';

@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): string {
    return getMetrics().render();
  }
}
