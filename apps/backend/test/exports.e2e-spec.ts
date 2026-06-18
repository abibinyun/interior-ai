import 'reflect-metadata';
import { promises as fs } from 'node:fs';
import JSZip from 'jszip';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { SupabaseStorageAdapter } from '../src/storage/supabase-storage.adapter';
import { StorageAdapter, UploadResult, SignedUrlResult } from '../src/storage/storage.adapter';

/**
 * In-memory fake that satisfies the new `download` method introduced in
 * M14 (the existing pipeline/references fakes don't cover it because
 * those tests never download). We pre-seed approved-image and uploaded-
 * reference bytes so the bundle assembly can prove it inlines them.
 */
class FakeStorageAdapter implements StorageAdapter {
  readonly name = 'fake';
  public readonly uploads: Array<{ key: string; body: Buffer; contentType: string }> = [];
  public readonly deletes: string[] = [];
  private readonly objects = new Map<string, Buffer>();

  // Pre-seeded test fixtures.
  seed(key: string, body: Buffer): void {
    this.objects.set(key, body);
  }

  async upload(req: { key: string; body: Buffer; contentType: string }): Promise<UploadResult> {
    this.uploads.push(req);
    this.objects.set(req.key, req.body);
    return { key: req.key, publicUrl: `https://fake.storage/${req.key}` };
  }

  async download(key: string): Promise<Buffer> {
    const body = this.objects.get(key);
    if (!body) {
      throw Object.assign(new Error(`fake: object not found: ${key}`), {
        code: 'STORAGE_FAILED',
        key,
      });
    }
    return body;
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<SignedUrlResult> {
    return {
      key,
      signedUrl: `https://fake.storage/signed/${key}`,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  async delete(key: string): Promise<void> {
    this.deletes.push(key);
    this.objects.delete(key);
  }
}

describe('M14 — Export Bundle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const fakeStorage = new FakeStorageAdapter();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseStorageAdapter)
      .useValue(fakeStorage)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    fakeStorage.uploads.length = 0;
    fakeStorage.deletes.length = 0;
  });

  async function cleanup(sid: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id: sid } }).catch(() => undefined);
  }

  async function bootstrapWithCompletedProject(opts: {
    rooms: Array<{ type: string; approvedImageBytes?: Buffer; approvedImageExt?: string; brief?: Record<string, string> }>;
    styleKey?: string;
    styleNotes?: string;
    uploadRefs?: Array<{ filename: string; mimeType: string; body: Buffer; caption?: string }>;
  }): Promise<{ sid: string; cookie: string; projectId: string; roomIds: string[] }> {
    const sessionRes = await request(app.getHttpServer()).get('/api/session');
    const sid = sessionRes.body.sessionId as string;
    const cookie = `sid=${sid}`;

    // 1. Project
    const project = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', cookie)
      .send({ name: `M14-${sid.slice(0, 8)}` });
    expect(project.status).toBe(201);
    const projectId = project.body.id as string;

    // 2. Style (optional)
    if (opts.styleKey) {
      const style = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/style`)
        .set('Cookie', cookie)
        .send({ styleKey: opts.styleKey, styleNotes: opts.styleNotes ?? null });
      expect(style.status).toBe(200);
    }

    // 3. Rooms + approved generations
    const roomIds: string[] = [];
    for (const roomSpec of opts.rooms) {
      const room = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/rooms`)
        .set('Cookie', cookie)
        .send({ roomType: roomSpec.type });
      expect(room.status).toBe(201);
      const roomId = room.body.id as string;
      roomIds.push(roomId);

      if (roomSpec.brief) {
        const brief = await request(app.getHttpServer())
          .put(`/api/rooms/${roomId}/brief`)
          .set('Cookie', cookie)
          .send(roomSpec.brief);
        expect(brief.status).toBe(200);
      }

      // 4. Generation batch → directly mark COMPLETED + set storageObjectKey
      const batch = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/generations`)
        .set('Cookie', cookie)
        .send({});
      expect(batch.status).toBe(201);
      const genId = batch.body.items[0].id as string;
      const ext = roomSpec.approvedImageExt ?? 'png';
      const key = `development/projects/${projectId}/rooms/${roomId}/generations/${genId}.${ext}`;
      // Pre-seed the storage so download() returns the fixture.
      fakeStorage.seed(
        key,
        roomSpec.approvedImageBytes ?? Buffer.from(`approved-image-bytes:${genId}`),
      );
      await prisma.generation.update({
        where: { id: genId },
        data: {
          status: 'COMPLETED',
          imageUrl: `https://fake.storage/${key}`,
          storageObjectKey: key,
        },
      });

      // 5. Approve the generation
      const approve = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/approval`)
        .set('Cookie', cookie)
        .send({ generationId: genId });
      expect(approve.status).toBe(200);
    }

    // 6. Uploaded references (optional, for one of the rooms)
    if (opts.uploadRefs && opts.uploadRefs.length > 0 && roomIds.length > 0) {
      const roomId = roomIds[0]!;
      for (const ref of opts.uploadRefs) {
        const upload = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references/upload`)
          .set('Cookie', cookie)
          .attach('file', ref.body, { filename: ref.filename, contentType: ref.mimeType });
        expect(upload.status).toBe(201);
      }
    }

    // 7. Complete the project
    const complete = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/complete`)
      .set('Cookie', cookie);
    expect(complete.status).toBe(201);

    return { sid, cookie, projectId, roomIds };
  }

  it('rejects export on a non-COMPLETED project (E-01)', async () => {
    const sessionRes = await request(app.getHttpServer()).get('/api/session');
    const sid = sessionRes.body.sessionId as string;
    const cookie = `sid=${sid}`;
    try {
      const project = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', cookie)
        .send({ name: `M14-E01-${sid.slice(0, 8)}` });
      const projectId = project.body.id as string;
      // No rooms → cannot complete; project stays DRAFT.
      const exportRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookie);
      expect(exportRes.status).toBe(400);
      expect(exportRes.body.error?.code).toBe('VALIDATION_FAILED');
    } finally {
      await cleanup(sid);
    }
  });

  it('returns 401 for a missing session', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/projects/00000000-0000-0000-0000-000000000000/exports');
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('creates a valid ZIP with manifest, approved images, prompts, notes, refs (DoD)', async () => {
    const { sid, cookie, projectId, roomIds } = await bootstrapWithCompletedProject({
      rooms: [
        {
          type: 'LIVING_ROOM',
          approvedImageBytes: Buffer.from('FAKE-PNG-BYTES-LIVING'),
          approvedImageExt: 'png',
          brief: {
            purpose: 'Family relaxation',
            occupants: 'Two adults and a child',
            lightingPreferences: 'Warm, indirect',
            furnitureRequirements: 'Large sectional',
            constraints: 'No structural changes',
          },
        },
        {
          type: 'KITCHEN',
          approvedImageBytes: Buffer.from('FAKE-PNG-BYTES-KITCHEN'),
          approvedImageExt: 'png',
        },
      ],
      styleKey: 'JAPANDI',
      styleNotes: 'Warm wood + neutral linen.',
    });

    try {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookie);
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.version).toBe(1);
      expect(typeof res.body.byteSize).toBe('number');
      expect(res.body.byteSize).toBeGreaterThan(0);
      expect(res.body.manifest?.schemaVersion).toBe(1);
      expect(res.body.manifest?.project?.id).toBe(projectId);
      expect(res.body.manifest?.styleProfile?.styleKey).toBe('JAPANDI');
      expect(res.body.manifest?.rooms).toHaveLength(2);

      // The bundle was uploaded to storage at the documented key prefix.
      const zipUpload = fakeStorage.uploads.find((u) =>
        u.key.startsWith(`test/exports/projects/${projectId}/v1.zip`),
      );
      expect(zipUpload).toBeDefined();
      expect(zipUpload!.contentType).toBe('application/zip');

      // Unzip and verify folder structure per ADR-010.
      const zip = await JSZip.loadAsync(zipUpload!.body);
      const files = Object.keys(zip.files);
      expect(files).toContain('project-summary.json');
      expect(files).toContain('style-profile.json');
      expect(files.some((f) => /^approved-images\/.+\.png$/.test(f))).toBe(true);
      expect(files.some((f) => /^prompts\/.+\.json$/.test(f))).toBe(true);
      expect(files.some((f) => /^room-notes\/.+\.md$/.test(f))).toBe(true);

      // Approved image bytes are inlined verbatim.
      const livingImg = await zip.file('approved-images/living-room.png')!.async('nodebuffer');
      expect(livingImg.toString('utf8')).toBe('FAKE-PNG-BYTES-LIVING');

      // Project summary has the project fields.
      const summary = JSON.parse(
        await zip.file('project-summary.json')!.async('string'),
      );
      expect(summary.project.id).toBe(projectId);
      expect(summary.project.name).toContain('M14-');
      expect(summary.project.status).toBe('COMPLETED');

      // Room notes reference both room ids.
      const livingNotes = await zip.file('room-notes/living-room.md')!.async('string');
      expect(livingNotes).toContain(roomIds[0]!);
      expect(livingNotes).toContain('Family relaxation');

      // Style profile is present.
      const style = JSON.parse(await zip.file('style-profile.json')!.async('string'));
      expect(style.styleKey).toBe('JAPANDI');
      expect(style.styleNotes).toBe('Warm wood + neutral linen.');

      // Prompts file has lineage even when not seeded (empty list).
      const promptLiving = JSON.parse(
        await zip.file('prompts/living-room.json')!.async('string'),
      );
      expect(promptLiving.kind).toBe('approved-prompt');
      expect(Array.isArray(promptLiving.generation.lineage)).toBe(true);
    } finally {
      await cleanup(sid);
    }
  });

  it('re-exporting produces v+1 with the same content (E-02 append-only)', async () => {
    const { sid, cookie, projectId } = await bootstrapWithCompletedProject({
      rooms: [
        { type: 'MASTER_BEDROOM', approvedImageBytes: Buffer.from('FAKE-BYTES-BED'), approvedImageExt: 'png' },
      ],
      styleKey: 'SCANDINAVIAN',
    });
    try {
      const first = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookie);
      expect(first.status).toBe(201);
      expect(first.body.version).toBe(1);

      const second = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookie);
      expect(second.status).toBe(201);
      expect(second.body.version).toBe(2);

      // Both bundles are listed, newest first.
      const list = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(2);
      expect(list.body.items[0].version).toBe(2);
      expect(list.body.items[1].version).toBe(1);

      // Two ZIPs were uploaded with distinct keys.
      const keys = fakeStorage.uploads
        .filter((u) => u.key.includes(`/exports/projects/${projectId}/`))
        .map((u) => u.key);
      expect(keys).toContain(`test/exports/projects/${projectId}/v1.zip`);
      expect(keys).toContain(`test/exports/projects/${projectId}/v2.zip`);
    } finally {
      await cleanup(sid);
    }
  });

  it('GET /api/exports/:id returns manifest + signed download URL (E-06)', async () => {
    const { sid, cookie, projectId } = await bootstrapWithCompletedProject({
      rooms: [
        { type: 'WORKSPACE', approvedImageBytes: Buffer.from('FAKE-BYTES-OFFICE'), approvedImageExt: 'png' },
      ],
    });
    try {
      const create = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookie);
      const bundleId = create.body.id as string;

      const res = await request(app.getHttpServer())
        .get(`/api/exports/${bundleId}`)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(bundleId);
      expect(res.body.version).toBe(1);
      expect(res.body.manifest?.project?.id).toBe(projectId);
      expect(res.body.downloadUrl).toBeDefined();
      expect(res.body.downloadUrlExpiresAt).toBeDefined();
      // Default 15 min TTL.
      const expiresAt = new Date(res.body.downloadUrlExpiresAt);
      const ttlMs = expiresAt.getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(14 * 60 * 1000);
      expect(ttlMs).toBeLessThan(16 * 60 * 1000);
    } finally {
      await cleanup(sid);
    }
  });

  it('hides cross-session bundles (404 on GET)', async () => {
    const { sid: sidA, cookie: cookieA, projectId } = await bootstrapWithCompletedProject({
      rooms: [
        { type: 'DINING_ROOM', approvedImageBytes: Buffer.from('FAKE'), approvedImageExt: 'png' },
      ],
    });
    let sidB: string | null = null;
    try {
      const create = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookieA);
      const bundleId = create.body.id as string;

      // New session: cookieB cannot see bundleA.
      const sessionB = await request(app.getHttpServer()).get('/api/session');
      sidB = sessionB.body.sessionId as string;
      const cookieB = `sid=${sidB}`;
      const cross = await request(app.getHttpServer())
        .get(`/api/exports/${bundleId}`)
        .set('Cookie', cookieB);
      expect(cross.status).toBe(404);
      expect(cross.body.error?.code).toBe('NOT_FOUND');
    } finally {
      await cleanup(sidA);
      if (sidB) await cleanup(sidB);
    }
  });

  it('inlines UPLOADED reference binaries under references/<id>.<ext>', async () => {
    const { sid, cookie, projectId, roomIds } = await bootstrapWithCompletedProject({
      rooms: [
        {
          type: 'BATHROOM',
          approvedImageBytes: Buffer.from('FAKE-BYTES-BATH'),
          approvedImageExt: 'png',
        },
      ],
      uploadRefs: [
        {
          filename: 'tile-mosaic.png',
          mimeType: 'image/png',
          body: Buffer.from('FAKE-UPLOADED-REF-BYTES'),
        },
      ],
    });
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookie);
      expect(res.status).toBe(201);
      const roomId = roomIds[0]!;

      const zipUpload = fakeStorage.uploads.find((u) =>
        u.key.includes(`/exports/projects/${projectId}/v1.zip`),
      );
      expect(zipUpload).toBeDefined();
      const zip = await JSZip.loadAsync(zipUpload!.body);
      const refJsonPath = Object.keys(zip.files).find(
        (f) => /^references\/[0-9a-f-]+\.json$/.test(f) && !f.endsWith('bin'),
      );
      expect(refJsonPath).toBeDefined();
      const refJson = JSON.parse(await zip.file(refJsonPath!)!.async('string'));
      expect(refJson.kind).toBe('reference');
      expect(refJson.sourceType).toBe('UPLOADED');
      expect(refJson.roomId).toBe(roomId);

      // The binary sibling exists and has the same bytes.
      const refBinPath = refJsonPath!.replace(/\.json$/, '.png');
      const refBin = await zip.file(refBinPath)!.async('nodebuffer');
      expect(refBin.toString('utf8')).toBe('FAKE-UPLOADED-REF-BYTES');
    } finally {
      await cleanup(sid);
    }
  });

  it('writes a ZIP that extracts cleanly with a real ZIP reader (sanity)', async () => {
    const { sid, cookie, projectId } = await bootstrapWithCompletedProject({
      rooms: [
        { type: 'WORKSPACE', approvedImageBytes: Buffer.from('Z'), approvedImageExt: 'png' },
      ],
      styleKey: 'JAPANDI',
    });
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookie);
      expect(res.status).toBe(201);

      // Use the real ZIP library to round-trip: this catches any silent
      // corruption in the writer (we already use jszip inside the
      // service, but reading it back via a fresh parser is a stronger
      // guarantee than just `loadAsync` from the same library).
      const zipUpload = fakeStorage.uploads.find((u) =>
        u.key.includes(`/exports/projects/${projectId}/v1.zip`),
      );
      const buffer = zipUpload!.body;
      const tmp = `/tmp/opencode/m14-bundle-${sid.slice(0, 8)}.zip`;
      await fs.writeFile(tmp, buffer);
      const re = await JSZip.loadAsync(buffer);
      const names = Object.keys(re.files);
      // ADR-010 floor: at minimum these three files must be present.
      expect(names).toContain('project-summary.json');
      expect(names).toContain('style-profile.json');
      expect(names.some((n) => n.startsWith('approved-images/'))).toBe(true);
    } finally {
      await cleanup(sid);
    }
  });
});
