import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';

describe('M11 — Consistency Anchor (integration e2e)', () => {
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

  async function getOrCreateSid(): Promise<{ sid: string; cookie: string }> {
    const res = await request(app.getHttpServer()).get('/api/session');
    const sid = res.body.sessionId as string;
    const cookie = `sid=${sid}`;
    return { sid, cookie };
  }

  async function createProjectWithStyle(
    cookie: string,
    name: string,
    styleKey: string,
    styleNotes?: string,
  ): Promise<{ projectId: string }> {
    const project = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', cookie)
      .send({ name });
    const projectId = project.body.id as string;
    const style = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/style`)
      .set('Cookie', cookie)
      .send({ styleKey, ...(styleNotes ? { styleNotes } : {}) });
    expect(style.status).toBe(200);
    return { projectId };
  }

  async function createBareProject(cookie: string, name: string): Promise<string> {
    const project = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', cookie)
      .send({ name });
    return project.body.id as string;
  }

  async function addRoomWithBrief(
    cookie: string,
    projectId: string,
    roomType: string,
    brief: { purpose?: string; constraints?: string } = {},
  ): Promise<string> {
    const room = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/rooms`)
      .set('Cookie', cookie)
      .send({ roomType });
    const roomId = room.body.id as string;
    const briefBody: Record<string, string> = {};
    if (brief.purpose) briefBody.purpose = brief.purpose;
    if (brief.constraints) briefBody.constraints = brief.constraints;
    if (Object.keys(briefBody).length > 0) {
      const r = await request(app.getHttpServer())
        .put(`/api/rooms/${roomId}/brief`)
        .set('Cookie', cookie)
        .send(briefBody);
      expect(r.status).toBe(200);
    }
    return roomId;
  }

  async function createCompletedGeneration(
    cookie: string,
    roomId: string,
    prompt: string,
  ): Promise<{ generationId: string; batchId: string }> {
    const batch = await request(app.getHttpServer())
      .post(`/api/rooms/${roomId}/generations`)
      .set('Cookie', cookie)
      .send({});
    expect(batch.status).toBe(201);
    const batchId = batch.body.batchId as string;
    const generationId = batch.body.items[0].id as string;
    // Manually mark COMPLETED with a known prompt + image_url (no real
    // AI/storage in tests). This simulates the pipeline succeeding.
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: 'COMPLETED',
        prompt,
        imageUrl: `https://test.storage/${generationId}.png`,
        storageObjectKey: `test/${generationId}.png`,
      },
    });
    return { generationId, batchId };
  }

  it('CA-01: no anchor on a project with no approved rooms and no style profile', async () => {
    const { sid, cookie } = await getOrCreateSid();
    try {
      const projectId = await createBareProject(cookie, 'CA01');
      const roomId = await addRoomWithBrief(cookie, projectId, 'LIVING_ROOM', {
        purpose: 'family relaxation',
      });
      const batch = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', cookie)
        .send({});
      expect(batch.status).toBe(201);
      const prompt = batch.body.items[0].prompt as string;
      // No anchor prefix should appear.
      expect(prompt).not.toContain('House-wide design language');
    } finally {
      await cleanup(sid);
    }
  });

  it('CA-02/CA-04: anchor contains style and approved-room prompt; non-approved rooms inherit it', async () => {
    const { sid, cookie } = await getOrCreateSid();
    try {
      const { projectId } = await createProjectWithStyle(cookie, 'CA02', 'JAPANDI', 'warm woods');
      const livingId = await addRoomWithBrief(cookie, projectId, 'LIVING_ROOM', {
        purpose: 'family relaxation',
      });
      // Approve a living-room generation with a distinctive prompt.
      const { generationId } = await createCompletedGeneration(
        cookie,
        livingId,
        'A serene japandi living room with low sofa, oak floor, linen cushions, and morning light.',
      );
      await request(app.getHttpServer())
        .post(`/api/rooms/${livingId}/approval`)
        .set('Cookie', cookie)
        .send({ generationId });
      // Now generate in a SECOND room — its prompt should include the anchor.
      const kitchenId = await addRoomWithBrief(cookie, projectId, 'KITCHEN', {
        purpose: 'family meals',
      });
      const kitchenBatch = await request(app.getHttpServer())
        .post(`/api/rooms/${kitchenId}/generations`)
        .set('Cookie', cookie)
        .send({});
      expect(kitchenBatch.status).toBe(201);
      const kitchenPrompt = kitchenBatch.body.items[0].prompt as string;
      expect(kitchenPrompt).toContain('House-wide design language');
      expect(kitchenPrompt).toContain('style=JAPANDI');
      expect(kitchenPrompt).toContain('warm woods');
      expect(kitchenPrompt).toContain('living room:');
      expect(kitchenPrompt).toContain('low sofa');
    } finally {
      await cleanup(sid);
    }
  });

  it('CA-03: approved-room prompts from M10 refinements are included in the anchor', async () => {
    const { sid, cookie } = await getOrCreateSid();
    try {
      const { projectId } = await createProjectWithStyle(cookie, 'CA03', 'SCANDINAVIAN');
      const livingId = await addRoomWithBrief(cookie, projectId, 'LIVING_ROOM');
      const { generationId } = await createCompletedGeneration(
        cookie,
        livingId,
        'A bright Scandinavian living room with pale wood and sheepskin throws.',
      );
      await request(app.getHttpServer())
        .post(`/api/rooms/${livingId}/approval`)
        .set('Cookie', cookie)
        .send({ generationId });
      // Generate in another room — anchor must include the approved prompt.
      const bedroomId = await addRoomWithBrief(cookie, projectId, 'MASTER_BEDROOM');
      const batch = await request(app.getHttpServer())
        .post(`/api/rooms/${bedroomId}/generations`)
        .set('Cookie', cookie)
        .send({});
      const prompt = batch.body.items[0].prompt as string;
      expect(prompt).toContain('living room:');
      expect(prompt).toContain('sheepskin');
    } finally {
      await cleanup(sid);
    }
  });

  it('updating which room is approved recomputes the anchor (CA-04: read-only, server-side)', async () => {
    const { sid, cookie } = await getOrCreateSid();
    try {
      const { projectId } = await createProjectWithStyle(cookie, 'CA04', 'INDUSTRIAL');
      const livingId = await addRoomWithBrief(cookie, projectId, 'LIVING_ROOM');
      const kitchenId = await addRoomWithBrief(cookie, projectId, 'KITCHEN');

      const living = await createCompletedGeneration(
        cookie,
        livingId,
        'Industrial living room with exposed brick and steel beams.',
      );
      await request(app.getHttpServer())
        .post(`/api/rooms/${livingId}/approval`)
        .set('Cookie', cookie)
        .send({ generationId: living.generationId });

      // First generation in BATHROOM should reference "living room".
      const bathroom1Id = await addRoomWithBrief(cookie, projectId, 'BATHROOM');
      const bathroom1 = await request(app.getHttpServer())
        .post(`/api/rooms/${bathroom1Id}/generations`)
        .set('Cookie', cookie)
        .send({});
      const p1 = bathroom1.body.items[0].prompt as string;
      expect(p1).toContain('living room:');
      expect(p1).not.toContain('kitchen:');

      // Now approve KITCHEN and re-open LIVING (clear its approval).
      const kitchen = await createCompletedGeneration(
        cookie,
        kitchenId,
        'Industrial kitchen with stainless steel countertops and pendant lights.',
      );
      await request(app.getHttpServer())
        .post(`/api/rooms/${kitchenId}/approval`)
        .set('Cookie', cookie)
        .send({ generationId: kitchen.generationId });
      // Re-open the living room to invalidate its approval.
      await request(app.getHttpServer())
        .post(`/api/rooms/${livingId}/reopen`)
        .set('Cookie', cookie)
        .send({});

      // Add a second trigger room and generate — should reference "kitchen" only.
      // (DINING_ROOM is unused elsewhere in this test.)
      const diningId = await addRoomWithBrief(cookie, projectId, 'DINING_ROOM', {
        purpose: 'family meals',
      });
      const diningBatch = await request(app.getHttpServer())
        .post(`/api/rooms/${diningId}/generations`)
        .set('Cookie', cookie)
        .send({});
      const p2 = diningBatch.body.items[0].prompt as string;
      expect(p2).toContain('kitchen:');
      expect(p2).not.toContain('living room:');
    } finally {
      await cleanup(sid);
    }
  });

  it('refinement batch on an APPROVED room is blocked; reopening re-enables generation', async () => {
    const { sid, cookie } = await getOrCreateSid();
    try {
      const { projectId } = await createProjectWithStyle(cookie, 'CA05', 'JAPANDI');
      const livingId = await addRoomWithBrief(cookie, projectId, 'LIVING_ROOM');
      const { generationId } = await createCompletedGeneration(
        cookie,
        livingId,
        'Approved generation.',
      );
      const approval = await request(app.getHttpServer())
        .post(`/api/rooms/${livingId}/approval`)
        .set('Cookie', cookie)
        .send({ generationId });
      expect(approval.status).toBe(200);

      // Attempting to generate on an APPROVED room should fail (PC-02 path).
      const blocked = await request(app.getHttpServer())
        .post(`/api/rooms/${livingId}/generations`)
        .set('Cookie', cookie)
        .send({});
      expect(blocked.status).toBe(409);

      // Re-open and generate again — anchor still includes this approved room
      // only AFTER we re-approve; for now the room is in IN_REVIEW with no
      // approval, so anchor should NOT include it.
      const reopen = await request(app.getHttpServer())
        .post(`/api/rooms/${livingId}/reopen`)
        .set('Cookie', cookie)
        .send({});
      expect(reopen.status).toBe(200);

      const bathroomId = await addRoomWithBrief(cookie, projectId, 'BATHROOM');
      const after = await request(app.getHttpServer())
        .post(`/api/rooms/${bathroomId}/generations`)
        .set('Cookie', cookie)
        .send({});
      const prompt = after.body.items[0].prompt as string;
      // Style segment remains; the previously approved room is no longer approved.
      expect(prompt).toContain('style=JAPANDI');
      expect(prompt).not.toContain('living room:');
    } finally {
      await cleanup(sid);
    }
  });
});
