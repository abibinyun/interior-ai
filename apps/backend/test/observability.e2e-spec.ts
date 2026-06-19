import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('M16 — Observability', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /api/health/live', () => {
    it('returns 200 with version + commit', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/live');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok' });
      expect(typeof res.body.version).toBe('string');
      expect(typeof res.body.commit).toBe('string');
    });
  });

  describe('GET /api/health/ready', () => {
    it('returns 200 with version + commit + checks', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/ready');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok' });
      expect(typeof res.body.version).toBe('string');
      expect(typeof res.body.commit).toBe('string');
      expect(typeof res.body.builtAt).toBe('string');
      expect(res.body.checks).toMatchObject({
        db: { status: 'ok' },
        storage: { status: 'ok' },
        ai: { status: 'ok' },
      });
    });
  });

  describe('GET /api/metrics', () => {
    it('returns Prometheus text format', async () => {
      const res = await request(app.getHttpServer()).get('/api/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toContain('# HELP http_requests_total');
      expect(res.text).toContain('# TYPE http_requests_total counter');
      expect(res.text).toContain('# HELP http_request_duration_seconds');
      expect(res.text).toContain('# TYPE http_request_duration_seconds histogram');
      expect(res.text).toContain('# TYPE process_start_time_seconds gauge');
    });

    it('increments http_requests_total after a request', async () => {
      await request(app.getHttpServer()).get('/api/health/live');
      const res = await request(app.getHttpServer()).get('/api/metrics');
      expect(res.text).toMatch(/http_requests_total\{[^}]*method="GET"[^}]*route="\/api\/health\/live"[^}]*status="200"\} \d+/);
    });

    it('does not include the /api/metrics endpoint itself', async () => {
      const res = await request(app.getHttpServer()).get('/api/metrics');
      expect(res.text).not.toMatch(/route="\/api\/metrics"/);
    });
  });

  describe('Request ID propagation', () => {
    it('echoes x-request-id from incoming headers', async () => {
      const incoming = 'req_test_obs_abc123';
      const res = await request(app.getHttpServer())
        .get('/api/health/live')
        .set('x-request-id', incoming);
      expect(res.headers['x-request-id']).toBe(incoming);
    });

    it('generates a request id when none is provided', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/live');
      expect(res.headers['x-request-id']).toBeTruthy();
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    });
  });

  describe('Cross-session (S-05)', () => {
    it('metrics endpoint is public (no session required)', async () => {
      const res = await request(app.getHttpServer()).get('/api/metrics');
      expect(res.status).toBe(200);
    });
  });
});
