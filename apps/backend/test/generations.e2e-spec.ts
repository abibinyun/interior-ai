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

async function setStyle(
  app: INestApplication,
  sessionId: string,
  projectId: string,
  styleKey: string,
): Promise<void> {
  await request(app.getHttpServer())
    .put(`/api/projects/${projectId}/style`)
    .set('Cookie', `sid=${sessionId}`)
    .send({ styleKey })
    .expect(200);
}

async function setBrief(
  app: INestApplication,
  sessionId: string,
  roomId: string,
  fields: Record<string, string>,
): Promise<void> {
  await request(app.getHttpServer())
    .put(`/api/rooms/${roomId}/brief`)
    .set('Cookie', `sid=${sessionId}`)
    .send(fields)
    .expect(200);
}

describe('M8 — Generations Core', () => {
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

  describe('Batch creation (G-01)', () => {
    let sessionId: string;
    let projectId: string;
    let roomId: string;

    beforeAll(async () => {
      sessionId = await createSession(app);
      projectId = await createProject(app, sessionId, 'GenTest');
      await setStyle(app, sessionId, projectId, 'JAPANDI');
      roomId = await createRoom(app, sessionId, projectId, 'LIVING_ROOM');
      await setBrief(app, sessionId, roomId, {
        purpose: 'Family relaxation',
        occupants: '2 adults, 1 child',
        lightingPreferences: 'Warm ambient',
        furnitureRequirements: 'Large sofa, low coffee table',
        constraints: 'No leather',
      });
    });
    afterAll(async () => {
      await cleanup(sessionId);
    });

    it('creates a batch with exactly 3 PENDING generations', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.batchId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.items.map((i: { optionIndex: number }) => i.optionIndex)).toEqual([1, 2, 3]);
      expect(res.body.items.every((i: { status: string }) => i.status === 'PENDING')).toBe(true);
      const batchIds = new Set(res.body.items.map((i: { batchId: string }) => i.batchId));
      expect(batchIds.size).toBe(1);
    });

    it('composes prompt with style, room, brief (G-06)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({});
      const first = res.body.items[0];
      expect(first.prompt.toLowerCase()).toContain('japandi');
      expect(first.prompt).toContain('living room');
      expect(first.prompt).toContain('Family relaxation');
      expect(first.prompt).toContain('No leather');
    });

    it('composes 3 distinct variations of the base prompt (ADR-009)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({});
      const prompts = res.body.items.map((i: { prompt: string }) => i.prompt);
      expect(new Set(prompts).size).toBe(3);
    });

    it('transitions room to GENERATING (G-02)', async () => {
      const freshProjectId = await createProject(app, sessionId, 'GenTest2');
      const freshRoomId = await createRoom(app, sessionId, freshProjectId, 'DINING_ROOM');
      const before = await request(app.getHttpServer())
        .get(`/api/rooms/${freshRoomId}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(before.body.status).toBe('BRIEF_DRAFT');
      await request(app.getHttpServer())
        .post(`/api/rooms/${freshRoomId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({})
        .expect(201);
      const after = await request(app.getHttpServer())
        .get(`/api/rooms/${freshRoomId}`)
        .set('Cookie', `sid=${sessionId}`);
      expect(after.body.status).toBe('GENERATING');
    });

    it('rejects briefOverride exceeding length caps (B-01)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ briefOverride: { purpose: 'x'.repeat(1001) } });
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown room', async () => {
      const ghost = '00000000-0000-0000-0000-000000000000';
      const res = await request(app.getHttpServer())
        .post(`/api/rooms/${ghost}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({});
      expect(res.status).toBe(404);
    });
  });

  describe('Refinement (G-05)', () => {
    let sessionId: string;
    let projectId: string;
    let roomId: string;
    let parentId: string;

    beforeAll(async () => {
      sessionId = await createSession(app);
      projectId = await createProject(app, sessionId, 'RefineTest');
      roomId = await createRoom(app, sessionId, projectId, 'KITCHEN');
      const first = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({});
      parentId = first.body.items[0].id;
      await prisma.generation.update({
        where: { id: parentId },
        data: { status: 'COMPLETED', imageUrl: 'https://example.com/parent.png' },
      });
    });
    afterAll(async () => {
      await cleanup(sessionId);
    });

    it('accepts a refinement with parentGenerationId', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ parentGenerationId: parentId, refinements: { colors: 'brighter' } });
      expect(res.status).toBe(201);
      expect(res.body.items.every((i: { parentGenerationId: string }) => i.parentGenerationId === parentId)).toBe(true);
    });

    it('rejects refinement with non-existent parent', async () => {
      const ghost = '00000000-0000-0000-0000-000000000000';
      const res = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ parentGenerationId: ghost });
      expect(res.status).toBe(404);
    });

    it('rejects refinement with non-COMPLETED parent', async () => {
      const incomplete = (
        await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .set('Cookie', `sid=${sessionId}`)
          .send({})
      ).body.items[0].id;
      const res = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({ parentGenerationId: incomplete });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    });
  });

  describe('Status state machine (G-02, G-03, G-04)', () => {
    let sessionId: string;
    let projectId: string;
    let roomId: string;
    let batchId: string;
    let genIds: string[];

    beforeAll(async () => {
      sessionId = await createSession(app);
      projectId = await createProject(app, sessionId, 'StatusTest');
      roomId = await createRoom(app, sessionId, projectId, 'BATHROOM');
      const res = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`)
        .send({});
      batchId = res.body.batchId;
      genIds = res.body.items.map((i: { id: string }) => i.id);
    });
    afterAll(async () => {
      await cleanup(sessionId);
    });

    it('lists generations by batchId (sorted by optionIndex)', async () => {
      const list = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`);
      expect(list.status).toBe(200);
      const batch = list.body.items.filter((i: { batchId: string }) => i.batchId === batchId);
      expect(batch.map((i: { optionIndex: number }) => i.optionIndex)).toEqual([1, 2, 3]);
    });

    it('transitions PENDING -> PROCESSING -> COMPLETED (G-02, G-03)', async () => {
      await prisma.generation.update({
        where: { id: genIds[0]! },
        data: { status: 'PROCESSING' },
      });
      const mid = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`);
      const midItem = mid.body.items.find((i: { id: string }) => i.id === genIds[0]);
      expect(midItem.status).toBe('PROCESSING');

      await prisma.generation.update({
        where: { id: genIds[0]! },
        data: { status: 'COMPLETED', imageUrl: 'https://example.com/x.png', storageObjectKey: 'k' },
      });
      const done = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`);
      const doneItem = done.body.items.find((i: { id: string }) => i.id === genIds[0]);
      expect(doneItem.status).toBe('COMPLETED');
      expect(doneItem.imageUrl).toBe('https://example.com/x.png');
    });

    it('transitions to FAILED with error code (G-04)', async () => {
      await prisma.generation.update({
        where: { id: genIds[1]! },
        data: { status: 'FAILED', errorCode: 'PROVIDER_TIMEOUT', errorMessage: 'timed out' },
      });
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sessionId}`);
      const item = res.body.items.find((i: { id: string }) => i.id === genIds[1]);
      expect(item.status).toBe('FAILED');
      expect(item.errorCode).toBe('PROVIDER_TIMEOUT');
      expect(item.errorMessage).toBe('timed out');
    });
  });

  describe('Cross-session isolation (S-05)', () => {
    it('returns 404 when another session tries to start a generation', async () => {
      const sessionA = await createSession(app);
      const sessionB = await createSession(app);
      try {
        const projectId = await createProject(app, sessionA, 'CrossGen');
        const roomId = await createRoom(app, sessionA, projectId, 'WORKSPACE');
        const res = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .set('Cookie', `sid=${sessionB}`)
          .send({});
        expect(res.status).toBe(404);
      } finally {
        await cleanup(sessionA);
        await cleanup(sessionB);
      }
    });
  });
});
