import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { Test } from '@nestjs/testing';
import { buildValidationPipe } from '../../src/common/validation.pipe';

/**
 * Build a NestJS test app the same way `main.ts` does in production:
 *
 * - Loads `AppModule` (or a list of modules).
 * - Installs cookie-parser (session cookie support).
 * - Sets the `api` global prefix.
 * - Installs the standardized `ValidationPipe` (M15 — emits
 *   `error.fields` for DTO failures).
 *
 * Tests that need ValidationPipe (i.e. tests that exercise DTOs) MUST
 * use this helper. The legacy `moduleRef.createNestApplication({...})`
 * pattern skips the pipe, which masks validation bugs.
 */
export async function buildTestApp(
  imports: Parameters<typeof Test.createTestingModule>[0]['imports'] = [],
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: (imports as never) || [],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(buildValidationPipe());
  await app.init();
  return app;
}
