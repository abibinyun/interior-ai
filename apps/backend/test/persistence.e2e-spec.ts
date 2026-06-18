import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';

describe('M2 — Persistence (against docker Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    // Mirror main.ts wiring that the production bootstrap applies.
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // Helper to clean up rows we create so tests are repeatable.
  async function cleanup(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
  }

  describe('Schema — CHECK constraints', () => {
    it('rejects a project with an empty name', async () => {
      const sid = 's_chk_empty_name';
      try {
        await expect(
          prisma.project.create({
            data: { sessionId: sid, name: '', status: 'DRAFT' },
          }),
        ).rejects.toThrow(/projects_name_length_chk|name/i);
      } finally {
        await cleanup([sid]);
      }
    });

    it('rejects a style_key outside the enum values', async () => {
      const sid = 's_chk_style';
      try {
        await prisma.session.create({ data: { id: sid } });
        const project = await prisma.project.create({
          data: { sessionId: sid, name: 'p1', status: 'DRAFT' },
        });
        await expect(
          prisma.styleProfile.create({
            data: { projectId: project.id, styleKey: 'BARNHOUSE' as never },
          }),
        ).rejects.toThrow(/style_profiles_style_key_chk|style_key/i);
        await prisma.project.delete({ where: { id: project.id } });
      } finally {
        await cleanup([sid]);
      }
    });

    it('rejects a generation with option_index outside 1..3', async () => {
      const sid = 's_chk_option';
      try {
        await prisma.session.create({ data: { id: sid } });
        const project = await prisma.project.create({
          data: { sessionId: sid, name: 'p2', status: 'DRAFT' },
        });
        const room = await prisma.room.create({
          data: { projectId: project.id, roomType: 'LIVING_ROOM' },
        });
        await expect(
          prisma.generation.create({
            data: {
              roomId: room.id,
              batchId: '00000000-0000-0000-0000-000000000001',
              optionIndex: 7,
              prompt: 'A long enough prompt for testing constraints.',
            },
          }),
        ).rejects.toThrow(/generations_option_index_chk|option_index/i);
        await prisma.project.delete({ where: { id: project.id } });
      } finally {
        await cleanup([sid]);
      }
    });

    it('rejects an APPROVED room with no approved_generation_id', async () => {
      const sid = 's_chk_approved';
      try {
        await prisma.session.create({ data: { id: sid } });
        const project = await prisma.project.create({
          data: { sessionId: sid, name: 'p3', status: 'DRAFT' },
        });
        const room = await prisma.room.create({
          data: { projectId: project.id, roomType: 'LIVING_ROOM' },
        });
        await expect(
          prisma.room.update({
            where: { id: room.id },
            data: { status: 'APPROVED' as never },
          }),
        ).rejects.toThrow(/rooms_approved_consistency_chk/i);
        await prisma.project.delete({ where: { id: project.id } });
      } finally {
        await cleanup([sid]);
      }
    });
  });

  describe('Triggers — session_id denormalization (ADR-005)', () => {
    it('denormalizes session_id on rooms via projects', async () => {
      const sid = 's_trg_room';
      try {
        await prisma.session.create({ data: { id: sid } });
        const project = await prisma.project.create({
          data: { sessionId: sid, name: 'p', status: 'DRAFT' },
        });
        const room = await prisma.room.create({
          data: { projectId: project.id, roomType: 'LIVING_ROOM' },
        });
        const loaded = await prisma.room.findUnique({ where: { id: room.id } });
        expect(loaded?.sessionId).toBe(sid);
      } finally {
        await cleanup([sid]);
      }
    });

    it('denormalizes session_id on generations via rooms', async () => {
      const sid = 's_trg_gen';
      try {
        await prisma.session.create({ data: { id: sid } });
        const project = await prisma.project.create({
          data: { sessionId: sid, name: 'p', status: 'DRAFT' },
        });
        const room = await prisma.room.create({
          data: { projectId: project.id, roomType: 'LIVING_ROOM' },
        });
        const gen = await prisma.generation.create({
          data: {
            roomId: room.id,
            batchId: '00000000-0000-0000-0000-0000000000aa',
            optionIndex: 1,
            prompt: 'A long enough prompt for testing triggers.',
          },
        });
        const loaded = await prisma.generation.findUnique({ where: { id: gen.id } });
        expect(loaded?.sessionId).toBe(sid);
      } finally {
        await cleanup([sid]);
      }
    });

    it('denormalizes session_id on references via rooms', async () => {
      const sid = 's_trg_ref';
      try {
        await prisma.session.create({ data: { id: sid } });
        const project = await prisma.project.create({
          data: { sessionId: sid, name: 'p', status: 'DRAFT' },
        });
        const room = await prisma.room.create({
          data: { projectId: project.id, roomType: 'LIVING_ROOM' },
        });
        const ref = await prisma.reference.create({
          data: {
            roomId: room.id,
            sourceType: 'EXTERNAL_URL',
            externalUrl: 'https://example.com/inspiration',
          },
        });
        const loaded = await prisma.reference.findUnique({ where: { id: ref.id } });
        expect(loaded?.sessionId).toBe(sid);
      } finally {
        await cleanup([sid]);
      }
    });

    it('denormalizes session_id on export_bundles via projects', async () => {
      const sid = 's_trg_exp';
      try {
        await prisma.session.create({ data: { id: sid } });
        const project = await prisma.project.create({
          data: { sessionId: sid, name: 'p', status: 'DRAFT' },
        });
        const bundle = await prisma.exportBundle.create({
          data: {
            projectId: project.id,
            version: 1,
            storageObjectKey: 'exports/projects/p/v1.zip',
            byteSize: 12345n,
            payload: { manifest: [] },
          },
        });
        const loaded = await prisma.exportBundle.findUnique({ where: { id: bundle.id } });
        expect(loaded?.sessionId).toBe(sid);
      } finally {
        await cleanup([sid]);
      }
    });

    it('refuses to insert a child row pointing at a non-existent parent', async () => {
      await expect(
        prisma.room.create({
          data: {
            projectId: '00000000-0000-0000-0000-000000000000',
            roomType: 'LIVING_ROOM',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Sessions endpoint — /api/session', () => {
    it('issues a new session id when no cookie is sent', async () => {
      const res = await request(app.getHttpServer()).get('/api/session').expect(200);
      expect(res.body.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(typeof res.body.createdAt).toBe('string');
      const setCookie = res.headers['set-cookie'];
      expect(Array.isArray(setCookie)).toBe(true);
      expect(String(setCookie?.[0] ?? '')).toMatch(/sid=/);
    });

    it('returns the same session id when the cookie is sent back', async () => {
      const first = await request(app.getHttpServer()).get('/api/session').expect(200);
      const sid = first.body.sessionId as string;
      const cookie = first.headers['set-cookie']?.[0]?.split(';')[0] ?? `sid=${sid}`;
      const second = await request(app.getHttpServer())
        .get('/api/session')
        .set('Cookie', cookie)
        .expect(200);
      expect(second.body.sessionId).toBe(sid);
      // Clean up the session row this test created.
      await prisma.session.delete({ where: { id: sid } }).catch(() => undefined);
    });
  });
});
