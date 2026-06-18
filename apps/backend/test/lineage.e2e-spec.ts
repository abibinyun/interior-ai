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

async function createProject(app: INestApplication, sid: string, name: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/projects')
    .set('Cookie', `sid=${sid}`)
    .send({ name });
  return res.body.id as string;
}

async function createRoom(app: INestApplication, sid: string, projectId: string, roomType: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(`/api/projects/${projectId}/rooms`)
    .set('Cookie', `sid=${sid}`)
    .send({ roomType });
  return res.body.id as string;
}

async function setBrief(app: INestApplication, sid: string, roomId: string): Promise<void> {
  await request(app.getHttpServer())
    .put(`/api/rooms/${roomId}/brief`)
    .set('Cookie', `sid=${sid}`)
    .send({ purpose: 'A cozy place', occupants: '2 adults' })
    .expect(200);
}

async function markCompleted(prisma: PrismaService, id: string): Promise<void> {
  await prisma.generation.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      imageUrl: `https://example.com/${id}.png`,
      storageObjectKey: `k/${id}.png`,
    },
  });
}

interface LineageResponse {
  root: { id: string; optionIndex: number; createdAt: string };
  ancestors: Array<{ id: string; optionIndex: number; createdAt: string }>;
  descendants: Array<{ id: string; optionIndex: number; createdAt: string }>;
}

describe('M10 — Refinement & Lineage', () => {
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

  async function cleanup(sid: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id: sid } });
  }

  describe('Lineage query', () => {
    let sid: string;
    let projectId: string;
    let roomId: string;
    let rootGenIds: string[];
    let childGenIds: string[];
    let grandchildGenIds: string[];

    beforeAll(async () => {
      sid = await createSession(app);
      projectId = await createProject(app, sid, 'LineageTest');
      roomId = await createRoom(app, sid, projectId, 'LIVING_ROOM');
      await setBrief(app, sid, roomId);

      const root = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sid}`)
        .send({});
      rootGenIds = root.body.items.map((i: { id: string }) => i.id);
      await Promise.all(rootGenIds.map((id) => markCompleted(prisma, id)));

      const child = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sid}`)
        .send({ parentGenerationId: rootGenIds[1] });
      childGenIds = child.body.items.map((i: { id: string }) => i.id);
      await Promise.all(childGenIds.map((id) => markCompleted(prisma, id)));

      const grandchild = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sid}`)
        .send({ parentGenerationId: childGenIds[0] });
      grandchildGenIds = grandchild.body.items.map((i: { id: string }) => i.id);
      await Promise.all(grandchildGenIds.map((id) => markCompleted(prisma, id)));
    });
    afterAll(async () => {
      await cleanup(sid);
    });

    it('returns root + 2 ancestors for the grandchild', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/generations/${grandchildGenIds[0]}/lineage`)
        .set('Cookie', `sid=${sid}`);
      expect(res.status).toBe(200);
      const body = res.body as LineageResponse;
      expect(body.root.id).toBe(rootGenIds[1]);
      expect(body.ancestors).toHaveLength(2);
      expect(body.ancestors[0]!.id).toBe(childGenIds[0]);
      expect(body.ancestors[1]!.id).toBe(grandchildGenIds[0]);
      expect(body.descendants).toHaveLength(0);
    });

    it('returns root + 1 ancestor + 3 descendants for the child option 0', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/generations/${childGenIds[0]}/lineage`)
        .set('Cookie', `sid=${sid}`);
      const body = res.body as LineageResponse;
      expect(body.root.id).toBe(rootGenIds[1]);
      expect(body.ancestors).toHaveLength(1);
      expect(body.ancestors[0]!.id).toBe(childGenIds[0]);
      expect(body.descendants).toHaveLength(3);
      const descIds = body.descendants.map((d) => d.id).sort();
      expect(descIds).toEqual([...grandchildGenIds].sort());
    });

    it('returns root only for the original root option 1 (no ancestors, 6 descendants)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/generations/${rootGenIds[1]}/lineage`)
        .set('Cookie', `sid=${sid}`);
      const body = res.body as LineageResponse;
      expect(body.root.id).toBe(rootGenIds[1]);
      expect(body.ancestors).toHaveLength(0);
      expect(body.descendants).toHaveLength(6);
    });

    it('returns 404 for a non-existent generation', async () => {
      const ghost = '00000000-0000-0000-0000-000000000000';
      const res = await request(app.getHttpServer())
        .get(`/api/generations/${ghost}/lineage`)
        .set('Cookie', `sid=${sid}`);
      expect(res.status).toBe(404);
    });

    it('returns 401 without a session', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/generations/${rootGenIds[0]}/lineage`);
      expect(res.status).toBe(401);
    });
  });

  describe('Refinement prompt composition', () => {
    let sid: string;
    let projectId: string;
    let roomId: string;

    beforeAll(async () => {
      sid = await createSession(app);
      projectId = await createProject(app, sid, 'RefinePrompt');
      roomId = await createRoom(app, sid, projectId, 'KITCHEN');
      await setBrief(app, sid, roomId);
    });
    afterAll(async () => {
      await cleanup(sid);
    });

    it('includes refinements in the composed prompt', async () => {
      const first = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sid}`)
        .send({});
      const parentId = first.body.items[0].id;
      await markCompleted(prisma, parentId);

      const refined = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sid}`)
        .send({
          parentGenerationId: parentId,
          refinements: { colors: 'warm earth tones', lighting: 'softer ambient' },
        });
      const firstPrompt = refined.body.items[0].prompt;
      expect(firstPrompt).toContain('warm earth tones');
      expect(firstPrompt).toContain('softer ambient');
    });

    it('all 3 child options share the same parent', async () => {
      const first = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sid}`)
        .send({});
      const parentId = first.body.items[1].id;
      await markCompleted(prisma, parentId);

      const refined = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', `sid=${sid}`)
        .send({ parentGenerationId: parentId });
      const parents = refined.body.items.map((i: { parentGenerationId: string }) => i.parentGenerationId);
      expect(parents).toEqual([parentId, parentId, parentId]);
    });
  });

  describe('Cross-session lineage (S-05)', () => {
    it('returns 404 when another session queries lineage', async () => {
      const sessionA = await createSession(app);
      const sessionB = await createSession(app);
      try {
        const projectId = await createProject(app, sessionA, 'CrossLineage');
        const roomId = await createRoom(app, sessionA, projectId, 'BATHROOM');
        const res = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .set('Cookie', `sid=${sessionA}`)
          .send({});
        const genId = res.body.items[0].id;
        await markCompleted(prisma, genId);

        const lineage = await request(app.getHttpServer())
          .get(`/api/generations/${genId}/lineage`)
          .set('Cookie', `sid=${sessionB}`);
        expect(lineage.status).toBe(404);
      } finally {
        await cleanup(sessionA);
        await cleanup(sessionB);
      }
    });
  });
});
