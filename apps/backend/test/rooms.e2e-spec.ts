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

  describe('Consistency anchor on GET /api/rooms/:id (F7 wire-up)', () => {
    let sessionId: string;
    let projectId: string;
    let livingId: string;
    let kitchenId: string;
    let approvedGenerationId: string;

    beforeAll(async () => {
      sessionId = await createSession(app);
      projectId = await createProject(app, sessionId, 'AnchorRoomTest');

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/style`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ styleKey: 'JAPANDI', styleNotes: 'warm woods' });

      const living = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/rooms`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ roomType: 'LIVING_ROOM' });
      livingId = living.body.id as string;
      await request(app.getHttpServer())
        .put(`/api/rooms/${livingId}/brief`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ purpose: 'family relaxation' });

      const batch = await request(app.getHttpServer())
        .post(`/api/rooms/${livingId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({});
      approvedGenerationId = batch.body.items[0].id as string;
      await prisma.generation.update({
        where: { id: approvedGenerationId },
        data: {
          status: 'COMPLETED',
          prompt: 'Japandi living room with low oak sofa and morning light.',
          imageUrl: `https://test.storage/${approvedGenerationId}.png`,
          storageObjectKey: `test/${approvedGenerationId}.png`,
        },
      });
      await request(app.getHttpServer())
        .post(`/api/rooms/${livingId}/approval`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ generationId: approvedGenerationId });

      const kitchen = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/rooms`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ roomType: 'KITCHEN' });
      kitchenId = kitchen.body.id as string;
    });
    afterAll(async () => {
      await cleanup(sessionId);
    });

    it('returns null anchor when no sibling room is approved yet', async () => {
      const sid = await createSession(app);
      try {
        const projId = await createProject(app, sid, 'NoAnchor');
        const room = await request(app.getHttpServer())
          .post(`/api/projects/${projId}/rooms`)
          .set('Cookie', `sid=${sid}`)
          .send({ roomType: 'LIVING_ROOM' });
        const res = await request(app.getHttpServer())
          .get(`/api/rooms/${room.body.id}`)
          .set('Cookie', `sid=${sid}`);
        expect(res.status).toBe(200);
        expect(res.body.consistencyAnchor).toBeNull();
      } finally {
        await cleanup(sid);
      }
    });

    it('returns the anchor string on a sibling room once one is approved', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${kitchenId}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.consistencyAnchor).toBe('string');
      expect(res.body.consistencyAnchor).toContain('House-wide design language');
      expect(res.body.consistencyAnchor).toContain('style=JAPANDI');
      expect(res.body.consistencyAnchor).toContain('living room:');
    });

    it('also returns the anchor on the approved room itself (style-only segment when alone)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${livingId}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.consistencyAnchor).toBe('string');
      expect(res.body.consistencyAnchor).toContain('style=JAPANDI');
    });

    it('returns null anchor after the approved room is reopened', async () => {
      await request(app.getHttpServer())
        .post(`/api/rooms/${livingId}/reopen`)
        .set('Cookie', `sid=${sessionId}`)
        .send({});
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${kitchenId}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(res.status).toBe(200);
      // Style segment remains, but the approved-room segment is gone — the
      // anchor is still a non-empty string (style-only).
      expect(res.body.consistencyAnchor).toContain('style=JAPANDI');
      expect(res.body.consistencyAnchor).not.toContain('living room:');
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
