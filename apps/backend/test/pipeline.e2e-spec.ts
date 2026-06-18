import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AI_PROVIDER_ADAPTER, AiProviderAdapter, GenerationRequest, GenerationResult, ProviderError } from '../src/ai/adapters/ai-provider.adapter';
import { MyceliAdapter } from '../src/ai/adapters/myceli.adapter';
import { PollinationsAdapter } from '../src/ai/adapters/pollinations.adapter';
import { STORAGE_ADAPTER, StorageAdapter, UploadRequest, UploadResult, SignedUrlResult } from '../src/storage/storage.adapter';
import { PrismaService } from '../src/prisma';
import { PipelineOrchestrator } from '../src/generations/pipeline-orchestrator';

class FakeAiAdapter implements AiProviderAdapter {
  readonly name: string;
  private callCount = 0;
  private readonly responses: Array<GenerationResult | Error>;

  constructor(name: string, responses: Array<GenerationResult | Error>) {
    this.name = name;
    this.responses = responses;
  }

  async generate(_req: GenerationRequest): Promise<GenerationResult> {
    const item = this.responses[this.callCount];
    this.callCount += 1;
    if (!item) throw new Error(`FakeAiAdapter(${this.name}): no response queued for call ${this.callCount}`);
    if (item instanceof Error) throw item;
    return item;
  }

  getCalls(): number { return this.callCount; }
}

class FakeStorageAdapter implements StorageAdapter {
  readonly name = 'fake';
  public readonly uploads: UploadRequest[] = [];
  private failCount = 0;

  async upload(req: UploadRequest): Promise<UploadResult> {
    if (this.failCount > 0) {
      this.failCount -= 1;
      throw Object.assign(new Error('Storage failed'), { code: 'STORAGE_FAILED', key: req.key });
    }
    this.uploads.push(req);
    return { key: req.key, publicUrl: `https://fake.storage/${req.key}` };
  }

  async signedUrl(key: string): Promise<SignedUrlResult> {
    return { key, signedUrl: `https://fake.storage/signed/${key}`, expiresAt: new Date(Date.now() + 900000) };
  }

  async delete(key: string): Promise<void> {
    void key;
  }

  setFailCount(n: number): void { this.failCount = n; }
}

function makeTimeoutError(): ProviderError {
  const e = new Error('timeout') as Error & { code: 'PROVIDER_TIMEOUT'; provider: string };
  e.code = 'PROVIDER_TIMEOUT';
  e.provider = 'fake';
  return e;
}

function makeBrokenError(): ProviderError {
  const e = new Error('500') as Error & { code: 'PROVIDER_BROKEN'; provider: string };
  e.code = 'PROVIDER_BROKEN';
  e.provider = 'fake';
  return e;
}

function makeRejectedError(): ProviderError {
  const e = new Error('400') as Error & { code: 'PROVIDER_REJECTED'; provider: string };
  e.code = 'PROVIDER_REJECTED';
  e.provider = 'fake';
  return e;
}

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

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

interface GenItem {
  id: string;
  status: string;
  imageUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

async function getGenerations(app: INestApplication, sid: string, roomId: string, genIds: string[]): Promise<GenItem[]> {
  const list = await request(app.getHttpServer())
    .get(`/api/rooms/${roomId}/generations`)
    .set('Cookie', `sid=${sid}`);
  return genIds.map((id) => list.body.items.find((i: { id: string }) => i.id === id)) as GenItem[];
}

describe('M9 — Generation Pipeline', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeStorage: FakeStorageAdapter;
  let fakePrimary: FakeAiAdapter;
  let fakeFallback: FakeAiAdapter;

  async function setupApp(
    primary: FakeAiAdapter,
    fallback: FakeAiAdapter,
    storage: FakeStorageAdapter,
  ): Promise<void> {
    if (app) await app.close();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_PROVIDER_ADAPTER)
      .useValue(primary)
      .overrideProvider(PollinationsAdapter)
      .useValue(primary)
      .overrideProvider(MyceliAdapter)
      .useValue(fallback)
      .overrideProvider(STORAGE_ADAPTER)
      .useValue(storage)
      .compile();
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
  }

  afterAll(async () => {
    if (app) await app.close();
  });

  async function cleanup(sid: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id: sid } });
  }

  async function startAndRun(
    sid: string,
    roomId: string,
  ): Promise<{ batchId: string; genIds: string[]; items: GenItem[] }> {
    const create = await request(app.getHttpServer())
      .post(`/api/rooms/${roomId}/generations`)
      .set('Cookie', `sid=${sid}`)
      .send({});
    expect(create.status).toBe(201);
    const batchId = create.body.batchId as string;
    const genIds = create.body.items.map((i: { id: string }) => i.id);
    const pipeline = app.get(PipelineOrchestrator);
    await pipeline.runBatch(batchId);
    const items = await getGenerations(app, sid, roomId, genIds);
    return { batchId, genIds, items };
  }

  it('happy path: all 3 generations COMPLETED with storage keys (G-03, SG-01)', async () => {
    fakeStorage = new FakeStorageAdapter();
    fakePrimary = new FakeAiAdapter('pollinations', [
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'pollinations' },
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'pollinations' },
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'pollinations' },
    ]);
    fakeFallback = new FakeAiAdapter('myceli', []);
    await setupApp(fakePrimary, fakeFallback, fakeStorage);

    const sid = await createSession(app);
    const projectId = await createProject(app, sid, 'PipelineHappy');
    const roomId = await createRoom(app, sid, projectId, 'LIVING_ROOM');
    await setBrief(app, sid, roomId);

    const { items } = await startAndRun(sid, roomId);
    for (const item of items) {
      expect(item.status).toBe('COMPLETED');
      expect(item.imageUrl).toMatch(/^https:\/\/fake\.storage\//);
      expect(item.errorCode).toBeNull();
    }
    expect(fakeStorage.uploads.length).toBe(3);

    const room = await request(app.getHttpServer())
      .get(`/api/rooms/${roomId}`)
      .set('Cookie', `sid=${sid}`);
    expect(room.body.status).toBe('IN_REVIEW');
    await cleanup(sid);
  });

  it('AI-07 fallback: primary times out, fallback succeeds', async () => {
    fakeStorage = new FakeStorageAdapter();
    fakePrimary = new FakeAiAdapter('pollinations', [
      makeTimeoutError(), makeTimeoutError(), makeTimeoutError(),
    ]);
    fakeFallback = new FakeAiAdapter('myceli', [
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'myceli' },
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'myceli' },
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'myceli' },
    ]);
    await setupApp(fakePrimary, fakeFallback, fakeStorage);

    const sid = await createSession(app);
    const projectId = await createProject(app, sid, 'PipelineFallback');
    const roomId = await createRoom(app, sid, projectId, 'KITCHEN');
    await setBrief(app, sid, roomId);

    const { items } = await startAndRun(sid, roomId);
    for (const item of items) {
      expect(item.status).toBe('COMPLETED');
    }
    expect(fakeFallback.getCalls()).toBe(3);
    await cleanup(sid);
  });

  it('AI-07 fallback: primary BROKEN, fallback works', async () => {
    fakeStorage = new FakeStorageAdapter();
    fakePrimary = new FakeAiAdapter('pollinations', [
      makeBrokenError(), makeBrokenError(), makeBrokenError(),
    ]);
    fakeFallback = new FakeAiAdapter('myceli', [
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'myceli' },
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'myceli' },
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'myceli' },
    ]);
    await setupApp(fakePrimary, fakeFallback, fakeStorage);

    const sid = await createSession(app);
    const projectId = await createProject(app, sid, 'PipelineBroken');
    const roomId = await createRoom(app, sid, projectId, 'BATHROOM');
    await setBrief(app, sid, roomId);

    const { items } = await startAndRun(sid, roomId);
    for (const item of items) expect(item.status).toBe('COMPLETED');
    await cleanup(sid);
  });

  it('PROVIDER_REJECTED does NOT trigger fallback (AI-07)', async () => {
    fakeStorage = new FakeStorageAdapter();
    fakePrimary = new FakeAiAdapter('pollinations', [
      makeRejectedError(), makeRejectedError(), makeRejectedError(),
    ]);
    fakeFallback = new FakeAiAdapter('myceli', []);
    await setupApp(fakePrimary, fakeFallback, fakeStorage);

    const sid = await createSession(app);
    const projectId = await createProject(app, sid, 'PipelineRejected');
    const roomId = await createRoom(app, sid, projectId, 'WORKSPACE');
    await setBrief(app, sid, roomId);

    const { items } = await startAndRun(sid, roomId);
    for (const item of items) {
      expect(item.status).toBe('FAILED');
      expect(item.errorCode).toBe('PROVIDER_REJECTED');
    }
    expect(fakeFallback.getCalls()).toBe(0);

    const room = await request(app.getHttpServer())
      .get(`/api/rooms/${roomId}`)
      .set('Cookie', `sid=${sid}`);
    expect(room.body.status).toBe('GENERATING');
    await cleanup(sid);
  });

  it('G-10: all-failed batch keeps room in GENERATING (no silent discard)', async () => {
    fakeStorage = new FakeStorageAdapter();
    fakePrimary = new FakeAiAdapter('pollinations', [
      makeTimeoutError(), makeTimeoutError(), makeTimeoutError(),
    ]);
    fakeFallback = new FakeAiAdapter('myceli', [
      makeTimeoutError(), makeTimeoutError(), makeTimeoutError(),
    ]);
    await setupApp(fakePrimary, fakeFallback, fakeStorage);

    const sid = await createSession(app);
    const projectId = await createProject(app, sid, 'PipelineAllFail');
    const roomId = await createRoom(app, sid, projectId, 'DINING_ROOM');
    await setBrief(app, sid, roomId);

    const { items } = await startAndRun(sid, roomId);
    for (const item of items) {
      expect(item.status).toBe('FAILED');
      expect(item.errorCode).toBe('PROVIDER_TIMEOUT');
    }

    const room = await request(app.getHttpServer())
      .get(`/api/rooms/${roomId}`)
      .set('Cookie', `sid=${sid}`);
    expect(room.body.status).toBe('GENERATING');
    await cleanup(sid);
  });

  it('SG-03: storage failure marks FAILED with STORAGE_FAILED', async () => {
    fakeStorage = new FakeStorageAdapter();
    fakeStorage.setFailCount(3);
    fakePrimary = new FakeAiAdapter('pollinations', [
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'pollinations' },
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'pollinations' },
      { imageBuffer: pngBuffer(), contentType: 'image/png', provider: 'pollinations' },
    ]);
    fakeFallback = new FakeAiAdapter('myceli', []);
    await setupApp(fakePrimary, fakeFallback, fakeStorage);

    const sid = await createSession(app);
    const projectId = await createProject(app, sid, 'PipelineStorageFail');
    const roomId = await createRoom(app, sid, projectId, 'MASTER_BEDROOM');
    await setBrief(app, sid, roomId);

    const { items } = await startAndRun(sid, roomId);
    for (const item of items) {
      expect(item.status).toBe('FAILED');
      expect(item.errorCode).toBe('STORAGE_FAILED');
    }
    await cleanup(sid);
  });
});
