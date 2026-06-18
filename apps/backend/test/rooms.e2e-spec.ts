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

describe('M5 — Rooms + Briefs', () => {
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

  describe('Room CRUD', () => {
    let sessionId: string;
    let projectId: string;

    beforeAll(async () => {
      sessionId = await createSession(app);
      projectId = await createProject(app, sessionId, 'RoomTest');
    });
    afterAll(async () => {
      await cleanup(sessionId);
    });

    it('returns 401 without a session', async () => {
      const res = await request(app.getHttpServer()).get(`/api/projects/${projectId}/rooms`);
      expect(res.status).toBe(401);
    });

    it('creates a room with empty designBrief (R-01, R-04)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/rooms`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ roomType: 'LIVING_ROOM' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        roomType: 'LIVING_ROOM',
        status: 'BRIEF_DRAFT',
        approvedGenerationId: null,
      });
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('rejects an unknown room type (R-02)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/rooms`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ roomType: 'BARNHOUSE' });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate roomType per project (R-03)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/rooms`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ roomType: 'LIVING_ROOM' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('lists rooms for a project', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/rooms`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it('returns 404 for a non-existent room', async () => {
      const ghost = '00000000-0000-0000-0000-000000000000';
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${ghost}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Design Brief (B-01..B-03)', () => {
    let sessionId: string;
    let projectId: string;
    let roomId: string;

    beforeAll(async () => {
      sessionId = await createSession(app);
      projectId = await createProject(app, sessionId, 'BriefTest');
      const create = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/rooms`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ roomType: 'MASTER_BEDROOM' });
      roomId = create.body.id;
    });
    afterAll(async () => {
      await cleanup(sessionId);
    });

    it('starts with no designBrief', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(200);
      expect(res.body.designBrief).toBeNull();
    });

    it('updates the brief (B-01, B-02)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/rooms/${roomId}/brief`)
        .set('Cookie', `sid=${sessionId}`)
        .send({
          purpose: 'Master bedroom for relaxation',
          occupants: '2 adults',
          lightingPreferences: 'Warm ambient, dimmable',
          furnitureRequirements: 'King bed, wardrobe, nightstands',
          constraints: 'No leather',
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        purpose: 'Master bedroom for relaxation',
        occupants: '2 adults',
        lightingPreferences: 'Warm ambient, dimmable',
        furnitureRequirements: 'King bed, wardrobe, nightstands',
        constraints: 'No leather',
      });
    });

    it('rejects text exceeding length caps (B-01)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/rooms/${roomId}/brief`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ purpose: 'x'.repeat(1001) });
      expect(res.status).toBe(400);
    });

    it('preserves the room when brief is updated (B-02)', async () => {
      const before = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}`)
        .set('Cookie', `sid=${sessionId}`);
      await request(app.getHttpServer())
        .put(`/api/rooms/${roomId}/brief`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ purpose: 'Updated purpose' });
      const after = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(after.body.id).toBe(before.body.id);
      expect(after.body.designBrief.purpose).toBe('Updated purpose');
    });

    it('editing brief on APPROVED room transitions to IN_REVIEW (B-03)', async () => {
      await prisma.room.update({
        where: { id: roomId },
        data: { status: 'APPROVED', approvedGenerationId: '00000000-0000-0000-0000-000000000001' },
      });
      const before = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(before.body.status).toBe('APPROVED');
      expect(before.body.approvedGenerationId).toBe('00000000-0000-0000-0000-000000000001');

      await request(app.getHttpServer())
        .put(`/api/rooms/${roomId}/brief`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ purpose: 'New purpose after approval' });

      const after = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(after.body.status).toBe('IN_REVIEW');
      expect(after.body.approvedGenerationId).toBeNull();
    });
  });

  describe('Cross-session isolation (S-05)', () => {
    it('returns 404 when another session tries to read a room', async () => {
      const sessionA = await createSession(app);
      const sessionB = await createSession(app);
      try {
        const projectId = await createProject(app, sessionA, 'CrossRoom');
        const create = await request(app.getHttpServer())
          .post(`/api/projects/${projectId}/rooms`)
          .set('Cookie', `sid=${sessionA}`)
          .send({ roomType: 'KITCHEN' });
        const roomId = create.body.id;

        const res = await request(app.getHttpServer())
          .get(`/api/rooms/${roomId}`)
          .set('Cookie', `sid=${sessionB}`);
        expect(res.status).toBe(404);
      } finally {
        await cleanup(sessionA);
        await cleanup(sessionB);
      }
    });

    it('returns 404 when another session tries to add a room', async () => {
      const sessionA = await createSession(app);
      const sessionB = await createSession(app);
      try {
        const projectId = await createProject(app, sessionA, 'AddCross');
        const res = await request(app.getHttpServer())
          .post(`/api/projects/${projectId}/rooms`)
          .set('Cookie', `sid=${sessionB}`)
          .send({ roomType: 'KITCHEN' });
        expect(res.status).toBe(404);
      } finally {
        await cleanup(sessionA);
        await cleanup(sessionB);
      }
    });

    it('returns 404 when another session tries to update a brief', async () => {
      const sessionA = await createSession(app);
      const sessionB = await createSession(app);
      try {
        const projectId = await createProject(app, sessionA, 'BriefCross');
        const create = await request(app.getHttpServer())
          .post(`/api/projects/${projectId}/rooms`)
          .set('Cookie', `sid=${sessionA}`)
          .send({ roomType: 'WORKSPACE' });
        const roomId = create.body.id;

        const res = await request(app.getHttpServer())
          .put(`/api/rooms/${roomId}/brief`)
          .set('Cookie', `sid=${sessionB}`)
          .send({ purpose: 'hijack' });
        expect(res.status).toBe(404);
      } finally {
        await cleanup(sessionA);
        await cleanup(sessionB);
      }
    });
  });
});
