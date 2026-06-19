import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health & Error Envelope (M1 smoke)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/health/live returns 200 with status:ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/live').expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.version).toBe('string');
    expect(typeof res.body.commit).toBe('string');
  });

  it('Unknown route returns the standardized error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
    expect(res.body.error).toHaveProperty('traceId');
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('Includes x-request-id on responses', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/live').expect(200);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('Echoes incoming x-request-id header when present', async () => {
    const incoming = 'req_test_abc123';
    const res = await request(app.getHttpServer())
      .get('/api/health/live')
      .set('x-request-id', incoming)
      .expect(200);
    expect(res.headers['x-request-id']).toBe(incoming);
  });
});
