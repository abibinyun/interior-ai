import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module';
import { buildValidationPipe } from './common/validation.pipe';
import { SecurityHeadersMiddleware } from './common/security-headers.middleware';
import { corsOriginsList, loadEnv } from './config';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(cookieParser());

  // Security headers on every response (helmet-equivalent baseline).
  app.use((req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    new SecurityHeadersMiddleware().use(req, res, next);
  });

  // Request size limit. JSON bodies are capped at 100 KB — more than
  // enough for our largest DTO (the export bundle request). Anything
  // larger is rejected before validation runs.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ limit: '100kb', extended: false }));

  app.enableCors({
    origin: corsOriginsList(env.CORS_ORIGINS),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(buildValidationPipe());

  await app.listen(env.PORT, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`Backend listening on http://0.0.0.0:${env.PORT}/api (env=${env.NODE_ENV})`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
