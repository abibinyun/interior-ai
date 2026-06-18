import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';

describe('M12 — Approval', () => {
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
  }> {
    const sessionRes = await request(app.getHttpServer()).get('/api/session');
    const sid = sessionRes.body.sessionId as string;
    const cookie = `sid=${sid}`;

    const project = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', cookie)
      .send({ name: `M12-${sid.slice(0, 8)}` });
    const projectId = project.body.id as string;

    const room = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/rooms`)
      .set('Cookie', cookie)
      .send({ roomType: 'LIVING_ROOM' });
    const roomId = room.body.id as string;

    return { sid, cookie, projectId, roomId };
  }

  /**
   * Create a batch and mark all generations COMPLETED, FAILED, or leave PENDING.
   * Returns the gen ids.
   *
   * If the room is APPROVED, it is reopened first so the new batch can
   * be created (rule: cannot generate on APPROVED room).
   */
  async function createBatchWithStatuses(
    cookie: string,
    roomId: string,
    statuses: Array<'COMPLETED' | 'FAILED' | 'PENDING'>,
  ): Promise<string[]> {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (room?.status === 'APPROVED') {
      const reopen = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/reopen`)
        .set('Cookie', cookie)
        .send({});
      expect(reopen.status).toBe(200);
    }

    const batch = await request(app.getHttpServer())
      .post(`/api/rooms/${roomId}/generations`)
      .set('Cookie', cookie)
      .send({});
    expect(batch.status).toBe(201);
    const genIds = batch.body.items.map((i: { id: string }) => i.id);
    for (let i = 0; i < genIds.length; i++) {
      const targetStatus = statuses[i] ?? 'COMPLETED';
      await prisma.generation.update({
        where: { id: genIds[i] },
        data:
          targetStatus === 'COMPLETED'
            ? {
                status: 'COMPLETED',
                prompt: 'A long enough prompt here for testing.',
                imageUrl: `https://test/${genIds[i]}.png`,
                storageObjectKey: `test/${genIds[i]}.png`,
              }
            : { status: targetStatus },
      });
    }
    return genIds;
  }

  describe('A-01: only COMPLETED generations may be approved', () => {
    it('rejects FAILED generation with 409', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const [failedId] = await createBatchWithStatuses(cookie, roomId, ['FAILED']);
        const res = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: failedId });
        expect(res.status).toBe(409);
        expect(res.body.error?.code).toBe('CONFLICT');
      } finally {
        await cleanup(sid);
      }
    });

    it('rejects PENDING generation with 409', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const [pendingId] = await createBatchWithStatuses(cookie, roomId, ['PENDING']);
        const res = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: pendingId });
        expect(res.status).toBe(409);
      } finally {
        await cleanup(sid);
      }
    });

    it('rejects non-existent generation with 404', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: '00000000-0000-0000-0000-000000000000' });
        expect(res.status).toBe(404);
      } finally {
        await cleanup(sid);
      }
    });

    it('rejects a COMPLETED generation that belongs to a different room with 404', async () => {
      const { sid, cookie, projectId, roomId } = await bootstrap();
      try {
        // Create a second room in the same project.
        const otherRoom = await request(app.getHttpServer())
          .post(`/api/projects/${projectId}/rooms`)
          .set('Cookie', cookie)
          .send({ roomType: 'KITCHEN' });
        const otherRoomId = otherRoom.body.id as string;
        const [genId] = await createBatchWithStatuses(cookie, otherRoomId, ['COMPLETED']);
        const res = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: genId });
        expect(res.status).toBe(404);
      } finally {
        await cleanup(sid);
      }
    });

    it('accepts COMPLETED generation with 200 and sets APPROVED state', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const [genId] = await createBatchWithStatuses(cookie, roomId, ['COMPLETED']);
        const res = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: genId });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('APPROVED');
        expect(res.body.approvedGenerationId).toBe(genId);

        const dbRoom = await prisma.room.findUnique({ where: { id: roomId } });
        expect(dbRoom?.status).toBe('APPROVED');
        expect(dbRoom?.approvedGenerationId).toBe(genId);
      } finally {
        await cleanup(sid);
      }
    });
  });

  describe('A-02: re-approval replaces pointer; old record unchanged', () => {
    it('approving a different COMPLETED generation in the same room updates the pointer', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const [genA] = await createBatchWithStatuses(cookie, roomId, ['COMPLETED']);
        const first = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: genA });
        expect(first.status).toBe(200);

        // Approve a different generation.
        const [, , genC] = await createBatchWithStatuses(cookie, roomId, [
          'COMPLETED',
          'COMPLETED',
          'COMPLETED',
        ]);
        const second = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: genC });
        expect(second.status).toBe(200);

        const dbRoom = await prisma.room.findUnique({ where: { id: roomId } });
        expect(dbRoom?.approvedGenerationId).toBe(genC);
        expect(dbRoom?.approvedGenerationId).not.toBe(genA);

        // The original generation is unchanged.
        const dbGenA = await prisma.generation.findUnique({ where: { id: genA } });
        expect(dbGenA?.status).toBe('COMPLETED');
        expect(dbGenA?.imageUrl).toContain('https://test/');
      } finally {
        await cleanup(sid);
      }
    });

    it('previous approval does not modify the prior generation row (rule G-04)', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const [genA] = await createBatchWithStatuses(cookie, roomId, ['COMPLETED']);
        await prisma.generation.update({
          where: { id: genA },
          data: { prompt: 'ORIGINAL PROMPT' },
        });
        await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: genA });

        const [, genB] = await createBatchWithStatuses(cookie, roomId, ['COMPLETED', 'COMPLETED']);
        await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: genB });

        const dbGenA = await prisma.generation.findUnique({ where: { id: genA } });
        expect(dbGenA?.prompt).toBe('ORIGINAL PROMPT');
        expect(dbGenA?.status).toBe('COMPLETED');
      } finally {
        await cleanup(sid);
      }
    });
  });

  describe('A-03 / reopen', () => {
    it('reopen clears approval and transitions to IN_REVIEW', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const [genId] = await createBatchWithStatuses(cookie, roomId, ['COMPLETED']);
        await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: genId });

        const reopen = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/reopen`)
          .set('Cookie', cookie)
          .send({});
        expect(reopen.status).toBe(200);
        const dbRoom = await prisma.room.findUnique({ where: { id: roomId } });
        expect(dbRoom?.status).toBe('IN_REVIEW');
        expect(dbRoom?.approvedGenerationId).toBeNull();
      } finally {
        await cleanup(sid);
      }
    });

    it('reopen rejects a non-APPROVED room with 409', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const reopen = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/reopen`)
          .set('Cookie', cookie)
          .send({});
        expect(reopen.status).toBe(409);
      } finally {
        await cleanup(sid);
      }
    });

    it('reopen re-enables generation (no longer blocked by APPROVED)', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const [genId] = await createBatchWithStatuses(cookie, roomId, ['COMPLETED']);
        await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/approval`)
          .set('Cookie', cookie)
          .send({ generationId: genId });

        const blocked = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .set('Cookie', cookie)
          .send({});
        expect(blocked.status).toBe(409);

        await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/reopen`)
          .set('Cookie', cookie)
          .send({});

        const ok = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/generations`)
          .set('Cookie', cookie)
          .send({});
        expect(ok.status).toBe(201);
      } finally {
        await cleanup(sid);
      }
    });
  });
});
