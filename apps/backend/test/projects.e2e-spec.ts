import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';

async function createSession(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer()).get('/api/session');
  return res.body.sessionId as string;
}

describe('M4 — Projects + Style', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function cleanup(sessionId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id: sessionId } });
  }

  describe('GET /api/styles (catalog)', () => {
    it('returns the hardcoded style catalog without requiring a session', async () => {
      const res = await request(app.getHttpServer()).get('/api/styles');
      expect(res.status).toBe(200);
      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBeGreaterThan(0);
      const keys = res.body.items.map((s: { key: string }) => s.key);
      expect(keys).toContain('JAPANDI');
    });
  });

  describe('Projects CRUD', () => {
    let sessionId: string;

    beforeAll(async () => {
      sessionId = await createSession(app);
    });
    afterAll(async () => {
      await cleanup(sessionId);
    });

    it('returns 401 without a session cookie', async () => {
      const res = await request(app.getHttpServer()).get('/api/projects');
      expect(res.status).toBe(401);
    });

    it('creates a project (P-01, P-02)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'My Dream House', description: 'A cozy place' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'My Dream House',
        description: 'A cozy place',
        status: 'DRAFT',
      });
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('rejects a project with empty name (P-02)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: '' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a project with name > 80 chars (P-02)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'x'.repeat(81) });
      expect(res.status).toBe(400);
    });

    it('rejects a duplicate project name within the same session (P-04)', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'DupTest' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'DupTest' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('lists projects for the session', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it('gets a project by id with embedded styleProfile and rooms', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'GetTest' });
      const id = create.body.id;
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${id}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id,
        name: 'GetTest',
        status: 'DRAFT',
        styleProfile: null,
      });
      expect(res.body.rooms).toEqual([]);
    });

    it('updates a project name and description', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'RenameMe' });
      const id = create.body.id;
      const res = await request(app.getHttpServer())
        .patch(`/api/projects/${id}`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'Renamed', description: 'new desc' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed');
      expect(res.body.description).toBe('new desc');
    });

    it('returns 404 for a non-existent project', async () => {
      const ghost = '00000000-0000-0000-0000-000000000000';
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${ghost}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Cross-session isolation (S-05)', () => {
    it('returns 404 when another session tries to read a project', async () => {
      const sessionA = await createSession(app);
      const sessionB = await createSession(app);
      try {
        const create = await request(app.getHttpServer())
          .post('/api/projects')
          .set('Cookie', `sid=${sessionA}`)
          .send({ name: 'SessionAProject' });
        const projectId = create.body.id;

        const res = await request(app.getHttpServer())
          .get(`/api/projects/${projectId}`)
          .set('Cookie', `sid=${sessionB}`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      } finally {
        await cleanup(sessionA);
        await cleanup(sessionB);
      }
    });

    it('returns 404 when another session tries to PATCH a project', async () => {
      const sessionA = await createSession(app);
      const sessionB = await createSession(app);
      try {
        const create = await request(app.getHttpServer())
          .post('/api/projects')
          .set('Cookie', `sid=${sessionA}`)
          .send({ name: 'PatchTest' });
        const projectId = create.body.id;

        const res = await request(app.getHttpServer())
          .patch(`/api/projects/${projectId}`)
          .set('Cookie', `sid=${sessionB}`)
          .send({ name: 'Hijacked' });
        expect(res.status).toBe(404);
      } finally {
        await cleanup(sessionA);
        await cleanup(sessionB);
      }
    });

    it('returns 404 when another session tries to complete a project', async () => {
      const sessionA = await createSession(app);
      const sessionB = await createSession(app);
      try {
        const create = await request(app.getHttpServer())
          .post('/api/projects')
          .set('Cookie', `sid=${sessionA}`)
          .send({ name: 'CompleteTest' });
        const projectId = create.body.id;

        const res = await request(app.getHttpServer())
          .post(`/api/projects/${projectId}/complete`)
          .set('Cookie', `sid=${sessionB}`);
        expect(res.status).toBe(404);
      } finally {
        await cleanup(sessionA);
        await cleanup(sessionB);
      }
    });
  });

  describe('Project lifecycle (complete/reopen)', () => {
    let sessionId: string;

    beforeAll(async () => {
      sessionId = await createSession(app);
    });
    afterAll(async () => {
      await cleanup(sessionId);
    });

    it('cannot complete a project with no rooms', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'NoRooms' });
      const id = create.body.id;
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${id}/complete`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('reopens a completed project (P-05)', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'ReopenTest' });
      const id = create.body.id;
      await request(app.getHttpServer())
        .post(`/api/projects/${id}/complete`)
        .set('Cookie', `sid=${sessionId}`)
        .expect(422);
      await prisma.project.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${id}/reopen`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.completedAt).toBeNull();
    });
  });

  describe('Style Profile (ST-01..ST-05)', () => {
    let sessionId: string;

    beforeAll(async () => {
      sessionId = await createSession(app);
    });
    afterAll(async () => {
      await cleanup(sessionId);
    });

    it('returns 404 when style profile not set', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'StyleTest' });
      const id = create.body.id;
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${id}/style`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(404);
    });

    it('sets a style profile (ST-01, ST-02)', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'StyleSet' });
      const id = create.body.id;
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${id}/style`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ styleKey: 'JAPANDI', styleNotes: 'Warm wood tones' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        styleKey: 'JAPANDI',
        styleNotes: 'Warm wood tones',
      });
    });

    it('rejects an unknown style key (ST-02)', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'BadStyle' });
      const id = create.body.id;
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${id}/style`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ styleKey: 'NONEXISTENT' });
      expect(res.status).toBe(404);
    });

    it('updates style profile in place (ST-03)', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', `sid=${sessionId}`)
        .send({ name: 'StyleUpdate' });
      const id = create.body.id;
      await request(app.getHttpServer())
        .put(`/api/projects/${id}/style`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ styleKey: 'JAPANDI' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${id}/style`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ styleKey: 'SCANDINAVIAN', styleNotes: 'Brighter' });
      expect(res.status).toBe(200);
      expect(res.body.styleKey).toBe('SCANDINAVIAN');
      expect(res.body.styleNotes).toBe('Brighter');
    });

    it('returns 404 when another session tries to set style', async () => {
      const sessionA = await createSession(app);
      const sessionB = await createSession(app);
      try {
        const create = await request(app.getHttpServer())
          .post('/api/projects')
          .set('Cookie', `sid=${sessionA}`)
          .send({ name: 'StyleCross' });
        const id = create.body.id;
        const res = await request(app.getHttpServer())
          .put(`/api/projects/${id}/style`)
          .set('Cookie', `sid=${sessionB}`)
          .send({ styleKey: 'JAPANDI' });
        expect(res.status).toBe(404);
      } finally {
        await cleanup(sessionA);
        await cleanup(sessionB);
      }
    });
  });

  describe('Style-change warning (SCA-04 meta)', () => {
    let sessionId: string;
    beforeAll(async () => {
      sessionId = await createSession(app);
    });
    afterAll(async () => {
      await cleanup(sessionId);
    });

    async function makeProjectWithApprovedRoom(
      cookie: string,
      name: string,
      styleKey: string,
    ): Promise<{ projectId: string; roomId: string }> {
      const create = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', cookie)
        .send({ name });
      const projectId = create.body.id as string;
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/style`)
        .set('Cookie', cookie)
        .send({ styleKey })
        .expect(200);
      const room = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/rooms`)
        .set('Cookie', cookie)
        .send({ roomType: 'LIVING_ROOM' });
      const roomId = room.body.id as string;
      // Force the room into APPROVED + an approved generation so the
      // count query returns 1. We bypass the AI pipeline here (it's
      // covered by M12 tests).
      await prisma.room.update({
        where: { id: roomId },
        data: { status: 'APPROVED', approvedGenerationId: '00000000-0000-0000-0000-000000000001' },
      });
      return { projectId, roomId };
    }

    it('returns meta.styleChangeWarning=true when style key changes and a room is APPROVED', async () => {
      const cookie = `sid=${sessionId}`;
      const { projectId } = await makeProjectWithApprovedRoom(cookie, 'SCA04-A', 'JAPANDI');
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/style`)
        .set('Cookie', cookie)
        .send({ styleKey: 'SCANDINAVIAN' });
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({
        styleChangeWarning: true,
        approvedRoomCount: 1,
      });
    });

    it('returns meta.styleChangeWarning=false when only notes change and a room is APPROVED', async () => {
      const cookie = `sid=${sessionId}`;
      const { projectId } = await makeProjectWithApprovedRoom(cookie, 'SCA04-B', 'JAPANDI');
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/style`)
        .set('Cookie', cookie)
        .send({ styleKey: 'JAPANDI', styleNotes: 'updated notes' });
      expect(res.status).toBe(200);
      expect(res.body.meta.styleChangeWarning).toBe(false);
      expect(res.body.meta.approvedRoomCount).toBe(1);
    });

    it('returns meta.styleChangeWarning=false when no rooms are approved', async () => {
      const cookie = `sid=${sessionId}`;
      const create = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', cookie)
        .send({ name: 'SCA04-C' });
      const projectId = create.body.id as string;
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/style`)
        .set('Cookie', cookie)
        .send({ styleKey: 'JAPANDI' });
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/style`)
        .set('Cookie', cookie)
        .send({ styleKey: 'SCANDINAVIAN' });
      expect(res.status).toBe(200);
      expect(res.body.meta.styleChangeWarning).toBe(false);
      expect(res.body.meta.approvedRoomCount).toBe(0);
    });
  });
});
