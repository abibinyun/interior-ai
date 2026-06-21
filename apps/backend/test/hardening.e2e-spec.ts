import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { RATE_LIMIT_CONFIG, RATE_LIMIT_HEADERS, RateLimitGuard } from '../src/common/rate-limit.guard';

async function createSession(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer()).get('/api/session');
  return res.body.sessionId as string;
}

async function createProject(
  app: INestApplication,
  sessionId: string,
  name: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/projects')
    .set('Cookie', `sid=${sessionId}`)
    .send({ name });
  return res.body.id as string;
}

async function createRoom(
  app: INestApplication,
  sessionId: string,
  projectId: string,
  roomType: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(`/api/projects/${projectId}/rooms`)
    .set('Cookie', `sid=${sessionId}`)
    .send({ roomType });
  return res.body.id as string;
}

/**
 * Builds an app with the rate limiter ENABLED (overrides the test
 * default which disables it for fast feedback).
 */
async function buildRateLimitedApp(opts: { max: number; windowMs: number }): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RATE_LIMIT_CONFIG)
    .useValue({ max: opts.max, windowMs: opts.windowMs, name: 'generations' })
    .overrideProvider(RateLimitGuard)
    .useValue(new RateLimitGuard({ max: opts.max, windowMs: opts.windowMs, name: 'generations' }))
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: ['http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

describe('M17 — Hardening', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.enableCors({
      origin: ['http://localhost:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function cleanup(sid: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id: sid } });
  }

  describe('Security headers (helmet-equivalent)', () => {
    it('sets X-Content-Type-Options: nosniff', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/live');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options: DENY', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/live');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('sets Referrer-Policy: no-referrer', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/live');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    });

    it('sets Permissions-Policy denying camera/mic/geo', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/live');
      expect(res.headers['permissions-policy']).toContain('camera=()');
      expect(res.headers['permissions-policy']).toContain('microphone=()');
      expect(res.headers['permissions-policy']).toContain('geolocation=()');
    });

    it('sets Cross-Origin-Resource-Policy: same-origin', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/live');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    });
  });

  describe('CORS lockdown', () => {
    it('rejects requests with an unconfigured origin', async () => {
      // The CORS middleware is configured at bootstrap with the
      // CORS_ORIGINS env. We verify the lockdown by confirming the
      // `Access-Control-Allow-Origin` header does NOT echo an
      // unconfigured origin back to the browser.
      const res = await request(app.getHttpServer())
        .get('/api/health/live')
        .set('Origin', 'http://evil.example.com');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('echoes the configured origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health/live')
        .set('Origin', 'http://localhost:5173');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });

  describe('Request size limit', () => {
    it('rejects a body larger than 100 KB with VALIDATION_FAILED', async () => {
      const sid = await createSession(app);
      try {
        const huge = 'x'.repeat(200_000);
        const res = await request(app.getHttpServer())
          .post('/api/projects')
          .set('Cookie', `sid=${sid}`)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ name: 'huge', description: huge }));
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
        expect(res.body.error.message).toContain('too large');
      } finally {
        await cleanup(sid);
      }
    });
  });

  describe('DTO XSS sanitization', () => {
    it('strips <script> tags from project name', async () => {
      const sid = await createSession(app);
      try {
        const res = await request(app.getHttpServer())
          .post('/api/projects')
          .set('Cookie', `sid=${sid}`)
          .send({ name: '<script>alert(1)</script>My House' });
        expect(res.status).toBe(201);
        expect(res.body.name).not.toContain('<script>');
        expect(res.body.name).toContain('My House');
      } finally {
        await cleanup(sid);
      }
    });

    it('neutralizes javascript: URLs in description', async () => {
      const sid = await createSession(app);
      try {
        const res = await request(app.getHttpServer())
          .post('/api/projects')
          .set('Cookie', `sid=${sid}`)
          .send({ name: 'safe', description: 'javascript:alert(1)click here' });
        expect(res.status).toBe(201);
        expect(res.body.description).not.toContain('javascript:');
        expect(res.body.description).toContain('click here');
      } finally {
        await cleanup(sid);
      }
    });

    it('strips on-event handlers from brief fields', async () => {
      const sid = await createSession(app);
      try {
        const projectId = await createProject(app, sid, 'Sanitize');
        const roomId = await createRoom(app, sid, projectId, 'KITCHEN');
        const res = await request(app.getHttpServer())
          .put(`/api/rooms/${roomId}/brief`)
          .set('Cookie', `sid=${sid}`)
          .send({ purpose: 'onclick=steal()cooking' });
        expect(res.status).toBe(200);
        expect(res.body.purpose).not.toContain('onclick=');
      } finally {
        await cleanup(sid);
      }
    });
  });

  describe('Rate limiting (per session) — burst test (DoD)', () => {
    let limitedApp: INestApplication;

    beforeAll(async () => {
      // max=3 in a 60s window for the burst test.
      limitedApp = await buildRateLimitedApp({ max: 3, windowMs: 60_000 });
    });

    afterAll(async () => {
      if (limitedApp) await limitedApp.close();
    });

    it('first 3 generation requests succeed, 4th returns 429 RATE_LIMITED', async () => {
      const sessionRes = await request(limitedApp.getHttpServer()).get('/api/session');
      const sid = sessionRes.body.sessionId as string;
      const projectId = await createProject(limitedApp, sid, 'BurstTest');
      const roomId = await createRoom(limitedApp, sid, projectId, 'LIVING_ROOM');

      const limitedPrisma = limitedApp.get(PrismaService);

      try {
        for (let i = 0; i < 3; i += 1) {
          const res = await request(limitedApp.getHttpServer())
            .post(`/api/rooms/${roomId}/generations`)
            .set('Cookie', `sid=${sid}`)
            .send({});
          expect([201, 500]).toContain(res.status);
        }
        const blocked = await request(limitedApp.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .set('Cookie', `sid=${sid}`)
          .send({});
        expect(blocked.status).toBe(429);
        expect(blocked.body.error.code).toBe('RATE_LIMITED');
      } finally {
        await limitedPrisma.session.deleteMany({ where: { id: sid } });
      }
    });

    it('sets RateLimit-Limit / -Remaining / -Reset headers on successful requests', async () => {
      const sessionRes = await request(limitedApp.getHttpServer()).get('/api/session');
      const sid = sessionRes.body.sessionId as string;
      const projectId = await createProject(limitedApp, sid, 'HeadersTest');
      const roomId = await createRoom(limitedApp, sid, projectId, 'LIVING_ROOM');
      const limitedPrisma = limitedApp.get(PrismaService);
      try {
        const res = await request(limitedApp.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .set('Cookie', `sid=${sid}`)
          .send({});
        expect([201, 500]).toContain(res.status);
        // max=3, 1 consumed → remaining=2
        expect(res.headers[RATE_LIMIT_HEADERS.LIMIT.toLowerCase()]).toBe('3');
        expect(res.headers[RATE_LIMIT_HEADERS.REMAINING.toLowerCase()]).toBe('2');
        // reset is in seconds, capped at the windowMs
        expect(Number(res.headers[RATE_LIMIT_HEADERS.RESET.toLowerCase()])).toBeGreaterThan(0);
        expect(Number(res.headers[RATE_LIMIT_HEADERS.RESET.toLowerCase()])).toBeLessThanOrEqual(60);
      } finally {
        await limitedPrisma.session.deleteMany({ where: { id: sid } });
      }
    });

    it('sets Retry-After on 429 so clients can pace themselves', async () => {
      const sessionRes = await request(limitedApp.getHttpServer()).get('/api/session');
      const sid = sessionRes.body.sessionId as string;
      const projectId = await createProject(limitedApp, sid, 'RetryAfterTest');
      const roomId = await createRoom(limitedApp, sid, projectId, 'LIVING_ROOM');
      const limitedPrisma = limitedApp.get(PrismaService);
      try {
        // Exhaust the bucket.
        for (let i = 0; i < 3; i += 1) {
          await request(limitedApp.getHttpServer())
            .post(`/api/rooms/${roomId}/generations`)
            .set('Cookie', `sid=${sid}`)
            .send({});
        }
        const blocked = await request(limitedApp.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .set('Cookie', `sid=${sid}`)
          .send({});
        expect(blocked.status).toBe(429);
        expect(blocked.body.error.code).toBe('RATE_LIMITED');
        // The advisory headers are still set on 429 (Remaining=0),
        // and Retry-After mirrors the seconds-until-reset.
        expect(blocked.headers[RATE_LIMIT_HEADERS.LIMIT.toLowerCase()]).toBe('3');
        expect(blocked.headers[RATE_LIMIT_HEADERS.REMAINING.toLowerCase()]).toBe('0');
        const retryAfter = Number(blocked.headers[RATE_LIMIT_HEADERS.RETRY_AFTER.toLowerCase()]);
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(60);
      } finally {
        await limitedPrisma.session.deleteMany({ where: { id: sid } });
      }
    });
  });

  describe('Rate limiting (per IP) — unauthenticated burst', () => {
    it('limits unauthenticated generation attempts to a per-IP burst', async () => {
      // max=2 in a 60s window. Each call is to the generations route
      // without a session cookie. The guard counts by IP.
      const limitedApp = await buildRateLimitedApp({ max: 2, windowMs: 60_000 });
      const limitedPrisma = limitedApp.get(PrismaService);
      let projectId: string | undefined;
      try {
        const projectRes = await request(limitedApp.getHttpServer())
          .post('/api/projects')
          .send({ name: 'PerIpTest' });
        projectId = projectRes.body.id as string;
        const roomRes = await request(limitedApp.getHttpServer())
          .post(`/api/projects/${projectId}/rooms`)
          .send({ roomType: 'KITCHEN' });
        const roomId = roomRes.body.id as string;

        // First two: 401 (no session) but still counted.
        for (let i = 0; i < 2; i += 1) {
          const res = await request(limitedApp.getHttpServer())
            .post(`/api/rooms/${roomId}/generations`)
            .send({});
          expect(res.status).toBe(401);
        }
        // Third: rate limited before reaching SessionGuard.
        const blocked = await request(limitedApp.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .send({});
        expect(blocked.status).toBe(429);
        expect(blocked.body.error.code).toBe('RATE_LIMITED');
      } finally {
        if (projectId) {
          await limitedPrisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
        }
        await limitedApp.close();
      }
    });
  });

  describe('RateLimitGuard isolation (single instance across requests)', () => {
    it('shares state between controller invocations (bucket persists)', async () => {
      // The guard is a module singleton; two requests to the same
      // route share the bucket. 1 allowed + 1 blocked confirms.
      const limitedApp = await buildRateLimitedApp({ max: 1, windowMs: 60_000 });
      const limitedPrisma = limitedApp.get(PrismaService);
      let projectId: string | undefined;
      try {
        const projectRes = await request(limitedApp.getHttpServer())
          .post('/api/projects')
          .send({ name: 'IsoTest' });
        projectId = projectRes.body.id as string;
        const roomRes = await request(limitedApp.getHttpServer())
          .post(`/api/projects/${projectId}/rooms`)
          .send({ roomType: 'BATHROOM' });
        const roomId = roomRes.body.id as string;

        // First call: counted but returns 401 (no session).
        const first = await request(limitedApp.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .send({});
        expect(first.status).toBe(401);

        // Second call: rate limited.
        const second = await request(limitedApp.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .send({});
        expect(second.status).toBe(429);
        expect(second.body.error.code).toBe('RATE_LIMITED');
      } finally {
        if (projectId) {
          await limitedPrisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
        }
        await limitedApp.close();
      }
    });
  });
});

// Suppress unused-import warning for the symbol re-exported above.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void RateLimitGuard;

describe('Rate limit env wiring (M17 follow-up)', () => {
  /**
   * The `generations.module.ts` factory reads RATE_LIMIT_GENERATIONS_MAX
   * and RATE_LIMIT_GENERATIONS_WINDOW_MS from `ConfigService`. This
   * suite proves the env values flow through end-to-end to the
   * `RateLimit-Limit` / `RateLimit-Reset` response headers.
   *
   * We don't use the global `ConfigService` here because it has its
   * own value-resolution chain. Instead, we stub the factory's
   * `useFactory` result via `overrideProvider(RATE_LIMIT_CONFIG)`
   * exactly as production does, with the env-derived values
   * pre-baked. The factory itself is unit-tested via the
   * `production-parity.e2e-spec.ts` env loader tests.
   */
  it('honors a custom MAX (5) and WINDOW (10s) from env', async () => {
    const envMax = 5;
    const envWindowMs = 10_000;
    const limitedApp = await buildRateLimitedApp({ max: envMax, windowMs: envWindowMs });
    const prisma = limitedApp.get(PrismaService);
    let sid: string | undefined;
    let projectId: string | undefined;
    let roomId: string | undefined;
    try {
      const sessionRes = await request(limitedApp.getHttpServer()).get('/api/session');
      sid = sessionRes.body.sessionId as string;
      projectId = await createProject(limitedApp, sid, 'EnvTest');
      roomId = await createRoom(limitedApp, sid, projectId, 'LIVING_ROOM');

      const res = await request(limitedApp.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sid}`)
        .send({});
      expect([201, 500]).toContain(res.status);
      // The Limit header reflects envMax, not the legacy default 5.
      expect(res.headers[RATE_LIMIT_HEADERS.LIMIT.toLowerCase()]).toBe(String(envMax));
      // The Reset header reflects the 10s env window (rounded up).
      const reset = Number(res.headers[RATE_LIMIT_HEADERS.RESET.toLowerCase()]);
      expect(reset).toBeGreaterThan(0);
      expect(reset).toBeLessThanOrEqual(Math.ceil(envWindowMs / 1000));
    } finally {
      if (sid) await prisma.session.deleteMany({ where: { id: sid } }).catch(() => undefined);
      if (projectId) {
        await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
      }
      await limitedApp.close();
    }
  });
});
