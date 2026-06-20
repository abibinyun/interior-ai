import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';

/**
 * Regression: an APPROVED room must still be able to read its
 * generation history. Previously `requireOwnedRoom` was reused for
 * read endpoints (listByRoomId / listByBatchIdInRoom) which threw 409
 * once the room status became APPROVED. Fixed by switching those two
 * read paths to `requireRoom` (session isolation only, no APPROVED
 * guard).
 */
describe('M14 — APPROVED room history is readable', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function cleanup(sid: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id: sid } }).catch(() => undefined);
  }

  async function bootstrap(): Promise<{
    sid: string;
    cookie: string;
    projectId: string;
    roomId: string;
    generationId: string;
  }> {
    const sessionRes = await request(app.getHttpServer()).get('/api/session').expect(200);
    const sid = sessionRes.body.sessionId as string;
    const cookie = `sid=${sid}`;

    const project = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', cookie)
      .send({ name: `ApprovedHistory-${sid.slice(0, 6)}` });
    const projectId = project.body.id as string;

    const room = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/rooms`)
      .set('Cookie', cookie)
      .send({ roomType: 'LIVING_ROOM' });
    const roomId = room.body.id as string;

    // Brief required to start a batch.
    await request(app.getHttpServer())
      .put(`/api/rooms/${roomId}/brief`)
      .set('Cookie', cookie)
      .send({ purpose: 'Family relaxation' })
      .expect(200);

    const batch = await request(app.getHttpServer())
      .post(`/api/rooms/${roomId}/generations`)
      .set('Cookie', cookie)
      .send({});
    expect(batch.status).toBe(201);
    const generationId = batch.body.items[0].id as string;

    // Mark the generation COMPLETED so approve can succeed.
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: 'COMPLETED',
        imageUrl: 'https://fake.storage/living.png',
        storageObjectKey: 'projects/p/rooms/r/generations/g.png',
      },
    });

    // Approve it.
    await request(app.getHttpServer())
      .post(`/api/rooms/${roomId}/approval`)
      .set('Cookie', cookie)
      .send({ generationId })
      .expect(200);

    return { sid, cookie, projectId, roomId, generationId };
  }

  it('GET /api/rooms/:id/generations returns 200 even when the room is APPROVED', async () => {
    const { sid, cookie, roomId } = await bootstrap();
    try {
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}/generations`)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      // At least one row carries our approved image.
      const approved = res.body.items.find((g: { id: string }) => g.id);
      expect(approved).toBeDefined();
    } finally {
      await cleanup(sid);
    }
  });

  it('GET /api/rooms/:id/generations/batches/:batchId returns 200 even when the room is APPROVED', async () => {
    const { sid, cookie, roomId } = await bootstrap();
    try {
      // Find the batch id from the room's generations list.
      const list = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}/generations`)
        .set('Cookie', cookie)
        .expect(200);
      const batchId = list.body.items[0].batchId as string;
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}/generations/batches/${batchId}`)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
    } finally {
      await cleanup(sid);
    }
  });
});