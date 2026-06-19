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
  const isProd = env.NODE_ENV === 'production';

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Trust the first proxy hop when behind a load balancer. Required
  // for `req.ip` (rate limiter, X-Forwarded-For) to reflect the real
  // client in production. Off in dev to avoid spoofing.
  if (isProd) {
    const httpAdapter = app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void };
    httpAdapter.set('trust proxy', 1);
  }

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

  // CORS: in production, the configured origins MUST be set; an
  // empty / wildcard CORS_ORIGINS is rejected at bootstrap.
  const allowedOrigins = corsOriginsList(env.CORS_ORIGINS);
  if (isProd && allowedOrigins.length === 0) {
    // eslint-disable-next-line no-console
    console.error('FATAL: CORS_ORIGINS must be set in production.');
    process.exit(1);
  }
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(buildValidationPipe());

  await app.listen(env.PORT, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(
    `Backend listening on http://0.0.0.0:${env.PORT}/api (env=${env.NODE_ENV}, ` +
    `cors_origins=${allowedOrigins.length}, app_version=${process.env.APP_VERSION ?? 'dev'})`,
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
