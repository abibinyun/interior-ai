import { Controller, Get } from '@nestjs/common';
import { STYLE_CATALOG } from './styles.catalog';

@Controller('styles')
export class StylesController {
  @Get()
  list(): { items: typeof STYLE_CATALOG } {
    return { items: STYLE_CATALOG };
  }
}
