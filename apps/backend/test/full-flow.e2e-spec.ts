import 'reflect-metadata';
import JSZip from 'jszip';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { SupabaseStorageAdapter } from '../src/storage/supabase-storage.adapter';
import {
  StorageAdapter,
  UploadResult,
  SignedUrlResult,
} from '../src/storage/storage.adapter';
import {
  AI_PROVIDER_ADAPTER,
  AiProviderAdapter,
  GenerationRequest,
  GenerationResult,
  ProviderHealth,
} from '../src/ai/adapters/ai-provider.adapter';
import { PipelineOrchestrator } from '../src/generations/pipeline-orchestrator';
import { buildValidationPipe } from '../src/common/validation.pipe';

/**
 * F0.5 — Full Vertical-Slice Backend Flow
 *
 * One session walks the entire user journey from `docs/01-user-journey.md`:
 *
 *   1.  Open site → server issues a session cookie.
 *   2.  Create a project (POST /api/projects).
 *   3.  Set the style profile (PUT /api/projects/:id/style).
 *   4.  Add two rooms (LIVING_ROOM, KITCHEN).
 *   5.  Write each room's design brief (PUT /api/rooms/:id/brief).
 *   6.  Start a generation batch (POST /api/rooms/:id/generations) → 3 options.
 *   7.  Manually run the pipeline (driven from this test, since the
 *       auto-trigger is disabled in `test/setup.ts`).
 *   8.  Approve the winning generation.
 *   9.  Add three reference types to room #1:
 *         a. GENERATED  → FK to the approved generation
 *         b. EXTERNAL_URL → a public image URL
 *         c. UPLOADED   → multipart upload, byte-equal in storage
 *   10. Repeat 6–8 for room #2 and verify the consistency anchor
 *       (ADR-011) propagates the approved room #1 prompt into room #2.
 *   11. Complete the project (POST /api/projects/:id/complete).
 *   12. Export the bundle (POST /api/projects/:id/exports) → v1.zip.
 *   13. Verify the ZIP contains every documented file (ADR-010) and
 *       that the inlined images are byte-exact copies of what the AI
 *       adapter returned.
 *   14. Re-export → v2.zip with v+1 versioning (E-02).
 *   15. Download via signed URL (GET /api/exports/:id) and parse again
 *       to prove the round-trip works end-to-end.
 *
 * This single test is the system's "press the button, see it work"
 * demo. If anything in the pipeline regresses (M8 batch creation, M9
 * pipeline, M11 anchor, M12 approval, M13 references, M14 export),
 * this test fails.
 */

class FakeStorageAdapter implements StorageAdapter {
  readonly name = 'fake';
  public readonly uploads: Array<{ key: string; body: Buffer; contentType: string }> = [];
  public readonly deletes: string[] = [];
  private readonly objects = new Map<string, Buffer>();
  // Optional failure mode for negative-path tests.
  private failMode: 'NONE' | 'STORAGE_FAILED' = 'NONE';

  seed(key: string, body: Buffer): void {
    this.objects.set(key, body);
  }

  async upload(req: { key: string; body: Buffer; contentType: string }): Promise<UploadResult> {
    if (this.failMode !== 'NONE') {
      throw Object.assign(new Error(`forced ${this.failMode}`), {
        code: this.failMode,
        key: req.key,
      });
    }
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

/**
 * AI adapter that returns a deterministic PNG-shaped buffer for every
 * generation. Each call gets a fresh "image" so byte equality
 * assertions on the export bundle are unambiguous.
 */
class FakeAiAdapter implements AiProviderAdapter {
  readonly name = 'fake-ai';
  private callCount = 0;

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    this.callCount += 1;
    // 8 bytes of content-type 'image/png' header + per-call marker.
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const marker = Buffer.from(`GEN-${this.callCount}-${req.prompt.slice(0, 32)}`);
    return {
      imageBuffer: Buffer.concat([header, marker]),
      contentType: 'image/png',
      provider: this.name,
    };
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { ok: true, latencyMs: 0, detail: 'fake' };
  }
}

describe('Full Vertical-Slice Backend Flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const fakeStorage = new FakeStorageAdapter();
  const fakeAi = new FakeAiAdapter();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseStorageAdapter).useValue(fakeStorage)
      .overrideProvider(AI_PROVIDER_ADAPTER).useValue(fakeAi)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(buildValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('walks the full user journey in one session', async () => {
    // ─────────────────────────────────────────────────────────────────
    // Step 1 — Open the site. The backend issues a sid cookie.
    // ─────────────────────────────────────────────────────────────────
    const sessionRes = await request(app.getHttpServer()).get('/api/session').expect(200);
    expect(sessionRes.body.sessionId).toMatch(/^[0-9a-f-]+$/);
    const sid = sessionRes.body.sessionId as string;
    const cookie = `sid=${sid}`;

    try {
      // ───────────────────────────────────────────────────────────────
      // Step 2 — Create a project.
      // ───────────────────────────────────────────────────────────────
      const list0 = await request(app.getHttpServer())
        .get('/api/projects').set('Cookie', cookie).expect(200);
      expect(list0.body.items).toEqual([]);

      const create = await request(app.getHttpServer())
        .post('/api/projects').set('Cookie', cookie).send({ name: 'My Dream House' });
      expect(create.status).toBe(201);
      const projectId = create.body.id as string;
      expect(create.body.status).toBe('DRAFT');

      // ───────────────────────────────────────────────────────────────
      // Step 3 — Set the style profile.
      // ───────────────────────────────────────────────────────────────
      const style = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/style`)
        .set('Cookie', cookie)
        .send({ styleKey: 'JAPANDI', styleNotes: 'Warm wood, neutral linen, plants.' });
      expect(style.status).toBe(200);
      expect(style.body.styleKey).toBe('JAPANDI');

      // ───────────────────────────────────────────────────────────────
      // Step 4 — Add two rooms.
      // ───────────────────────────────────────────────────────────────
      const living = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/rooms`)
        .set('Cookie', cookie)
        .send({ roomType: 'LIVING_ROOM' });
      expect(living.status).toBe(201);
      const livingRoomId = living.body.id as string;

      const kitchen = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/rooms`)
        .set('Cookie', cookie)
        .send({ roomType: 'KITCHEN' });
      expect(kitchen.status).toBe(201);
      const kitchenRoomId = kitchen.body.id as string;

      // ───────────────────────────────────────────────────────────────
      // Step 5 — Write each room's design brief.
      // ───────────────────────────────────────────────────────────────
      await request(app.getHttpServer())
        .put(`/api/rooms/${livingRoomId}/brief`)
        .set('Cookie', cookie)
        .send({
          purpose: 'Family relaxation',
          occupants: 'Two adults, one child, one cat',
          lightingPreferences: 'Warm, indirect, dimmable',
          furnitureRequirements: 'Large modular sectional',
          constraints: 'No structural changes; keep radiator.',
        })
        .expect(200);

      await request(app.getHttpServer())
        .put(`/api/rooms/${kitchenRoomId}/brief`)
        .set('Cookie', cookie)
        .send({
          purpose: 'Daily cooking + weekend entertaining',
          occupants: 'Same household',
          lightingPreferences: 'Bright task lighting + pendant over island',
          furnitureRequirements: 'Island with seating for 3',
          constraints: 'Gas line stays; keep window above sink.',
        })
        .expect(200);

      // ───────────────────────────────────────────────────────────────
      // Step 6 — Start a generation batch on the living room.
      // ───────────────────────────────────────────────────────────────
      const batch1 = await request(app.getHttpServer())
        .post(`/api/rooms/${livingRoomId}/generations`)
        .set('Cookie', cookie)
        .send({});
      expect(batch1.status).toBe(201);
      expect(batch1.body.items).toHaveLength(3);
      const batch1Id = batch1.body.batchId as string;
      const livingGenIds = batch1.body.items.map((i: { id: string }) => i.id);

      // ───────────────────────────────────────────────────────────────
      // Step 7 — Manually run the pipeline (auto-trigger is off in test).
      // ───────────────────────────────────────────────────────────────
      const pipeline = app.get(PipelineOrchestrator);
      const result1 = await pipeline.runBatch(batch1Id);
      expect(result1.batchId).toBe(batch1Id);
      expect(result1.completed).toBe(3);
      expect(result1.failed).toBe(0);
      expect(result1.allFailed).toBe(false);

      // Verify each row is COMPLETED with a real image URL + storage key.
      const livingBatches = await request(app.getHttpServer())
        .get(`/api/rooms/${livingRoomId}/generations/batches/${batch1Id}`)
        .set('Cookie', cookie).expect(200);
      for (const gen of livingBatches.body.items) {
        expect(gen.status).toBe('COMPLETED');
        expect(gen.imageUrl).toMatch(/^https:\/\/fake\.storage\//);
        expect(gen.storageObjectKey).toMatch(/^test\/projects\//);
      }

      // ───────────────────────────────────────────────────────────────
      // Step 8 — Approve one of the three options.
      // ───────────────────────────────────────────────────────────────
      const approvedGenId = livingGenIds[0];
      const approve = await request(app.getHttpServer())
        .post(`/api/rooms/${livingRoomId}/approval`)
        .set('Cookie', cookie)
        .send({ generationId: approvedGenId });
      expect(approve.status).toBe(200);
      expect(approve.body.approvedGenerationId).toBe(approvedGenId);
      expect(approve.body.status).toBe('APPROVED');

      // ───────────────────────────────────────────────────────────────
      // Step 9a — Add a GENERATED reference (FK to approved gen).
      // ───────────────────────────────────────────────────────────────
      const refGen = await request(app.getHttpServer())
        .post(`/api/rooms/${livingRoomId}/references`)
        .set('Cookie', cookie)
        .send({ sourceType: 'GENERATED', sourceId: approvedGenId, caption: 'final approved look' });
      expect(refGen.status).toBe(201);
      expect(refGen.body.sourceType).toBe('GENERATED');

      // ───────────────────────────────────────────────────────────────
      // Step 9b — Add an EXTERNAL_URL reference.
      // ───────────────────────────────────────────────────────────────
      const refUrl = await request(app.getHttpServer())
        .post(`/api/rooms/${livingRoomId}/references`)
        .set('Cookie', cookie)
        .send({
          sourceType: 'EXTERNAL_URL',
          externalUrl: 'https://example.com/inspiration/living-room.png',
          caption: 'mood reference',
        });
      expect(refUrl.status).toBe(201);
      expect(refUrl.body.sourceType).toBe('EXTERNAL_URL');

      // ───────────────────────────────────────────────────────────────
      // Step 9c — Upload a UPLOADED reference (multipart).
      // ───────────────────────────────────────────────────────────────
      const uploadBytes = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('UPLOADED-REFERENCE-BYTES'),
      ]);
      const refUpload = await request(app.getHttpServer())
        .post(`/api/rooms/${livingRoomId}/references/upload`)
        .set('Cookie', cookie)
        .attach('file', uploadBytes, { filename: 'tile-mosaic.png', contentType: 'image/png' });
      expect(refUpload.status).toBe(201);
      expect(refUpload.body.sourceType).toBe('UPLOADED');
      expect(refUpload.body.url).toMatch(/^https:\/\/fake\.storage\/signed\//);

      // ───────────────────────────────────────────────────────────────
      // Step 10 — Generate + approve kitchen, verifying the
      //           consistency anchor (ADR-011) propagates the
      //           approved living-room prompt into the kitchen.
      // ───────────────────────────────────────────────────────────────
      const batch2 = await request(app.getHttpServer())
        .post(`/api/rooms/${kitchenRoomId}/generations`)
        .set('Cookie', cookie)
        .send({});
      expect(batch2.status).toBe(201);
      const batch2Id = batch2.body.batchId as string;

      const result2 = await pipeline.runBatch(batch2Id);
      expect(result2.completed).toBe(3);

      // Find the kitchen's prompt and assert it contains the approved
      // living-room anchor segment.
      const kitchenBatches = await request(app.getHttpServer())
        .get(`/api/rooms/${kitchenRoomId}/generations/batches/${batch2Id}`)
        .set('Cookie', cookie).expect(200);
      const kitchenPrompt = kitchenBatches.body.items[0].prompt as string;
      // The anchor is server-side injected via ADR-011. We assert the
      // anchor segment appears at least once across all 3 prompts.
      const allKitchenPrompts = (kitchenBatches.body.items as Array<{ prompt: string }>)
        .map((g) => g.prompt)
        .join('\n');
      expect(allKitchenPrompts).toContain('JAPANDI'); // style key surfaces via anchor
      // The actual approved generation prompt should also surface in
      // the anchor for cross-room consistency.
      expect(allKitchenPrompts).toContain('Family relaxation');
      // Sanity: the kitchen prompt differs from the living-room one
      // (different room_type + brief) but inherits the style anchor.
      expect(kitchenPrompt).not.toBe('');

      // Approve the kitchen.
      const approvedKitchenGenId = kitchenBatches.body.items[0].id as string;
      await request(app.getHttpServer())
        .post(`/api/rooms/${kitchenRoomId}/approval`)
        .set('Cookie', cookie)
        .send({ generationId: approvedKitchenGenId })
        .expect(200);

      // ───────────────────────────────────────────────────────────────
      // Step 11 — Complete the project.
      // ───────────────────────────────────────────────────────────────
      const complete = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/complete`)
        .set('Cookie', cookie);
      expect(complete.status).toBe(201);
      expect(complete.body.status).toBe('COMPLETED');

      // ───────────────────────────────────────────────────────────────
      // Step 12 — Export the bundle (v1).
      // ───────────────────────────────────────────────────────────────
      const export1 = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookie);
      expect(export1.status).toBe(201);
      expect(export1.body.version).toBe(1);
      expect(export1.body.byteSize).toBeGreaterThan(0);
      expect(export1.body.manifest).toBeDefined();
      expect(export1.body.manifest.project.id).toBe(projectId);
      expect(export1.body.manifest.styleProfile.styleKey).toBe('JAPANDI');
      expect(export1.body.manifest.rooms).toHaveLength(2);

      // ───────────────────────────────────────────────────────────────
      // Step 13 — Verify the ZIP contents (ADR-010 + E-04 byte-exact).
      // ───────────────────────────────────────────────────────────────
      const zipUpload1 = fakeStorage.uploads.find((u) =>
        u.key === `test/exports/projects/${projectId}/v1.zip`);
      expect(zipUpload1).toBeDefined();
      expect(zipUpload1!.contentType).toBe('application/zip');

      const zip1 = await JSZip.loadAsync(zipUpload1!.body);
      const names1 = Object.keys(zip1.files);
      expect(names1).toContain('project-summary.json');
      expect(names1).toContain('style-profile.json');
      expect(names1.some((n) => n === 'approved-images/living-room.png')).toBe(true);
      expect(names1.some((n) => n === 'approved-images/kitchen.png')).toBe(true);
      expect(names1.some((n) => n === 'prompts/living-room.json')).toBe(true);
      expect(names1.some((n) => n === 'prompts/kitchen.json')).toBe(true);
      expect(names1.some((n) => n === 'room-notes/living-room.md')).toBe(true);
      expect(names1.some((n) => n === 'room-notes/kitchen.md')).toBe(true);
      // The GENERATED ref has a .json but no binary sibling.
      expect(names1.some((n) => n.startsWith('references/') && n.endsWith('.json'))).toBe(true);
      // The UPLOADED ref has both a .json and a .png binary sibling.
      expect(names1.some((n) => n.startsWith('references/') && n.endsWith('.png'))).toBe(true);

      // Verify the approved images are byte-exact copies of what the
      // AI adapter returned (E-04 reproducibility / SG-01 integrity).
      const livingImg = await zip1.file('approved-images/living-room.png')!.async('nodebuffer');
      // Find the corresponding storage key for the approved gen.
      const approvedLivingRow = await prisma.generation.findUnique({
        where: { id: approvedGenId },
      });
      expect(approvedLivingRow?.storageObjectKey).toBeTruthy();
      const originalLivingImg = await fakeStorage.download(approvedLivingRow!.storageObjectKey!);
      expect(livingImg.equals(originalLivingImg)).toBe(true);

      // The UPLOADED ref binary must be byte-exact.
      const uploadedRef = await prisma.reference.findFirst({
        where: { roomId: livingRoomId, sourceType: 'UPLOADED' },
      });
      expect(uploadedRef?.storageObjectKey).toBeTruthy();
      const uploadedBinaryInZip = await zip1.file(
        `references/${uploadedRef!.id}.png`,
      )!.async('nodebuffer');
      const uploadedBinaryInStorage = await fakeStorage.download(uploadedRef!.storageObjectKey!);
      expect(uploadedBinaryInZip.equals(uploadedBinaryInStorage)).toBe(true);
      expect(uploadedBinaryInZip.equals(uploadBytes)).toBe(true);

      // Room notes include the brief content.
      const livingNotes = await zip1.file('room-notes/living-room.md')!.async('string');
      expect(livingNotes).toContain('Family relaxation');
      expect(livingNotes).toContain(livingRoomId);

      // ───────────────────────────────────────────────────────────────
      // Step 14 — Re-export → v2 (E-02 append-only).
      // ───────────────────────────────────────────────────────────────
      const export2 = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/exports`)
        .set('Cookie', cookie);
      expect(export2.status).toBe(201);
      expect(export2.body.version).toBe(2);

      const listBundles = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/exports`).set('Cookie', cookie).expect(200);
      expect(listBundles.body.items).toHaveLength(2);
      expect(listBundles.body.items[0].version).toBe(2);
      expect(listBundles.body.items[1].version).toBe(1);

      // ───────────────────────────────────────────────────────────────
      // Step 15 — Download v2 via the metadata endpoint and re-parse.
      // ───────────────────────────────────────────────────────────────
      const v2Id = export2.body.id as string;
      const meta = await request(app.getHttpServer())
        .get(`/api/exports/${v2Id}`).set('Cookie', cookie).expect(200);
      expect(meta.body.version).toBe(2);
      expect(meta.body.manifest.rooms).toHaveLength(2);
      expect(meta.body.downloadUrl).toMatch(/^https:\/\/fake\.storage\/signed\//);
      expect(meta.body.downloadUrlExpiresAt).toBeDefined();

      // The TTL is ~15 min (900 s). Allow a generous window.
      const expiresAtMs = new Date(meta.body.downloadUrlExpiresAt).getTime();
      const ttlMs = expiresAtMs - Date.now();
      expect(ttlMs).toBeGreaterThan(14 * 60 * 1000);
      expect(ttlMs).toBeLessThan(16 * 60 * 1000);

      // Verify the v2 ZIP round-trip: storage has v2.zip bytes, and
      // we can re-parse them.
      const v2Key = meta.body.manifest.files.find(
        (f: { path: string }) => f.path === 'approved-images/living-room.png',
      );
      expect(v2Key).toBeDefined();
      const zipUpload2 = fakeStorage.uploads.find((u) =>
        u.key === `test/exports/projects/${projectId}/v2.zip`);
      expect(zipUpload2).toBeDefined();
      const zip2 = await JSZip.loadAsync(zipUpload2!.body);
      expect(Object.keys(zip2.files).some((n) => n === 'project-summary.json')).toBe(true);
    } finally {
      // Cleanup so this test doesn't leak data between runs.
      await prisma.session.deleteMany({ where: { id: sid } }).catch(() => undefined);
    }
  });
});