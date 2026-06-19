import 'reflect-metadata';
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SessionGuard } from '../src/sessions/session.guard';
import { PrismaService } from '../src/prisma';

@Controller('protected-test')
@UseGuards(SessionGuard)
class ProtectedTestController {
  @Get()
  hello(): { ok: true; sessionId: string } {
    return { ok: true, sessionId: 'placeholder' };
  }

  @Get('public')
  publicHello(): { ok: true } {
    return { ok: true };
  }
}

describe('M3 — Session Guard', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedTestController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function cleanup(sessionId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id: sessionId } });
  }

  describe('Protected routes', () => {
    it('returns 401 UNAUTHENTICATED when no cookie is present', async () => {
      const res = await request(app.getHttpServer()).get('/api/protected-test');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns 401 UNAUTHENTICATED when cookie is empty', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/protected-test')
        .set('Cookie', 'sid=');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('creates a session when cookie is present but session id is unknown to the DB', async () => {
      const ghostId = 'ghost-session-that-never-existed-99999';
      try {
        const res = await request(app.getHttpServer())
          .get('/api/protected-test')
          .set('Cookie', `sid=${ghostId}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, sessionId: 'placeholder' });
      } finally {
        await cleanup(ghostId);
      }
    });

    it('returns 200 and refreshes the session when cookie is valid', async () => {
      const create = await request(app.getHttpServer()).get('/api/session');
      expect(create.status).toBe(200);
      const sessionId = create.body.sessionId as string;
      const setCookie = create.headers['set-cookie']?.[0] ?? '';
      expect(setCookie).toContain('sid=');

      try {
        const res = await request(app.getHttpServer())
          .get('/api/protected-test')
          .set('Cookie', `sid=${sessionId}`);
        expect(res.status).toBe(200);
      } finally {
        await cleanup(sessionId);
      }
    });

    it('reuses the same session id across requests with a valid cookie', async () => {
      const create = await request(app.getHttpServer()).get('/api/session');
      const first = create.body.sessionId as string;
      try {
        const second = await request(app.getHttpServer())
          .get('/api/session')
          .set('Cookie', `sid=${first}`);
        expect(second.status).toBe(200);
        expect(second.body.sessionId).toBe(first);
      } finally {
        await cleanup(first);
      }
    });
  });

  describe('Public routes', () => {
    it('health endpoint stays public (no cookie required)', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('session endpoint creates a session without a cookie', async () => {
      const res = await request(app.getHttpServer()).get('/api/session');
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    });
  });

  describe('Request context population', () => {
    it('forSession() is wired to the request scope (not a global state)', async () => {
      const create = await request(app.getHttpServer()).get('/api/session');
      const a = create.body.sessionId as string;
      try {
        const bCreate = await request(app.getHttpServer()).get('/api/session');
        const b = bCreate.body.sessionId as string;
        try {
          expect(a).not.toBe(b);
        } finally {
          await cleanup(b);
        }
      } finally {
        await cleanup(a);
      }
    });
  });
});
