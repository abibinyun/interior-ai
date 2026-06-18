import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { StorageAdapter } from '../src/storage/storage.adapter';
import { SupabaseStorageAdapter } from '../src/storage/supabase-storage.adapter';

class FakeStorageAdapter implements StorageAdapter {
  readonly name = 'fake';
  public readonly uploads: Array<{ key: string; body: Buffer; contentType: string }> = [];
  private failOnUpload: 'NONE' | 'STORAGE_FAILED' | 'UPLOAD_REJECTED' = 'NONE';

  async upload(req: { key: string; body: Buffer; contentType: string }): Promise<{ key: string; publicUrl: string }> {
    if (this.failOnUpload !== 'NONE') {
      const err = new Error(`forced ${this.failOnUpload}`) as Error & {
        code: 'STORAGE_FAILED' | 'UPLOAD_REJECTED';
      };
      err.code = this.failOnUpload;
      throw err;
    }
    this.uploads.push(req);
    return { key: req.key, publicUrl: `https://fake.storage/${req.key}` };
  }
  async signedUrl(key: string): Promise<{ key: string; signedUrl: string; expiresAt: Date }> {
    return { key, signedUrl: `https://fake.storage/signed/${key}`, expiresAt: new Date(Date.now() + 900000) };
  }
  async delete(_key: string): Promise<void> {
    void _key;
  }
  async download(key: string): Promise<Buffer> {
    return Buffer.from(`fake-download:${key}`);
  }
  setFailureMode(mode: 'NONE' | 'STORAGE_FAILED' | 'UPLOAD_REJECTED'): void {
    this.failOnUpload = mode;
  }
}

function makeJpegBuffer(size: number): Buffer {
  // PNG signature + padding to satisfy byte-count assertions; content type is
  // set explicitly by the test, so the fileFilter in the controller is what
  // validates it.
  const buf = Buffer.alloc(size, 0xff);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  return buf;
}

describe('M13 — References', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // Shared between the describe scope and the overrideProvider factory.
  const fakeStorageProxy = new FakeStorageAdapter();

  beforeAll(async () => {
    // Override SupabaseStorageAdapter directly (the STORAGE_ADAPTER token uses
    // useExisting, so overriding the token doesn't work; the class itself
    // is the injectable provider).
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseStorageAdapter)
      .useValue(fakeStorageProxy)
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
    // Reset shared state between tests so absolute upload counts (e.g.
    // `uploads.length === 0` for rejection cases) are deterministic
    // regardless of test order.
    fakeStorageProxy.uploads.length = 0;
    fakeStorageProxy.setFailureMode('NONE');
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
      .send({ name: `M13-${sid.slice(0, 8)}` });
    const projectId = project.body.id as string;
    const room = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/rooms`)
      .set('Cookie', cookie)
      .send({ roomType: 'LIVING_ROOM' });
    const roomId = room.body.id as string;
    return { sid, cookie, projectId, roomId };
  }

  async function makeCompletedGeneration(
    cookie: string,
    roomId: string,
  ): Promise<string> {
    const batch = await request(app.getHttpServer())
      .post(`/api/rooms/${roomId}/generations`)
      .set('Cookie', cookie)
      .send({});
    expect(batch.status).toBe(201);
    const genId = batch.body.items[0].id as string;
    await prisma.generation.update({
      where: { id: genId },
      data: {
        status: 'COMPLETED',
        prompt: 'A long enough prompt here for testing.',
        imageUrl: `https://test/${genId}.png`,
        storageObjectKey: `test/${genId}.png`,
      },
    });
    return genId;
  }

  describe('GENERATED references', () => {
    it('attaches a GENERATED reference to a generation in this room', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const genId = await makeCompletedGeneration(cookie, roomId);
        const add = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie)
          .send({ sourceType: 'GENERATED', sourceId: genId, caption: 'inspiration' });
        expect(add.status).toBe(201);
        expect(add.body.sourceType).toBe('GENERATED');
        expect(add.body.sourceId).toBe(genId);
        expect(add.body.caption).toBe('inspiration');

        const list = await request(app.getHttpServer())
          .get(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie);
        expect(list.status).toBe(200);
        expect(list.body.items.length).toBe(1);
        expect(list.body.items[0].id).toBe(add.body.id);
      } finally {
        await cleanup(sid);
      }
    });

    it('returns 404 when GENERATED sourceId belongs to a different room (DoD: cross-room)', async () => {
      const { sid, cookie, projectId, roomId } = await bootstrap();
      try {
        const otherRoom = await request(app.getHttpServer())
          .post(`/api/projects/${projectId}/rooms`)
          .set('Cookie', cookie)
          .send({ roomType: 'KITCHEN' });
        const otherRoomId = otherRoom.body.id as string;
        const genId = await makeCompletedGeneration(cookie, otherRoomId);
        const add = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie)
          .send({ sourceType: 'GENERATED', sourceId: genId });
        expect(add.status).toBe(404);
      } finally {
        await cleanup(sid);
      }
    });

    it('returns 404 when GENERATED sourceId belongs to another session (session isolation)', async () => {
      const { sid: sidA, cookie: cookieA, roomId: roomA } = await bootstrap();
      const sessionB = await request(app.getHttpServer()).get('/api/session');
      const sidB = sessionB.body.sessionId as string;
      const cookieB = `sid=${sidB}`;
      try {
        const genId = await makeCompletedGeneration(cookieA, roomA);
        const add = await request(app.getHttpServer())
          .post(`/api/rooms/${roomA}/references`)
          .set('Cookie', cookieB)
          .send({ sourceType: 'GENERATED', sourceId: genId });
        expect(add.status).toBe(404);
      } finally {
        await cleanup(sidA);
        await cleanup(sidB);
      }
    });

    it('returns 400 when GENERATED sourceId is missing', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const add = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie)
          .send({ sourceType: 'GENERATED' });
        expect(add.status).toBe(400);
      } finally {
        await cleanup(sid);
      }
    });
  });

  describe('EXTERNAL_URL references', () => {
    it('attaches an EXTERNAL_URL reference with a well-formed URL', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const add = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie)
          .send({ sourceType: 'EXTERNAL_URL', externalUrl: 'https://example.com/inspiration' });
        expect(add.status).toBe(201);
        expect(add.body.externalUrl).toBe('https://example.com/inspiration');
      } finally {
        await cleanup(sid);
      }
    });

    it('returns 400 for an EXTERNAL_URL that fails format validation', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const add = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie)
          .send({ sourceType: 'EXTERNAL_URL', externalUrl: 'not-a-url' });
        expect(add.status).toBe(400);
      } finally {
        await cleanup(sid);
      }
    });

    it('returns 409 for UPLOADED submitted to the JSON endpoint', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const add = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie)
          .send({ sourceType: 'UPLOADED' });
        expect(add.status).toBe(409);
      } finally {
        await cleanup(sid);
      }
    });
  });

  describe('UPLOADED references (multipart)', () => {
    it('uploads a small image and returns it with a signed URL in the list', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const small = makeJpegBuffer(1024);
        const upload = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references/upload`)
          .set('Cookie', cookie)
          .field('caption', 'huzurlu')
          .attach('file', small, { filename: 'inspo.png', contentType: 'image/png' });
        expect(upload.status).toBe(201);
        expect(upload.body.sourceType).toBe('UPLOADED');
        expect(upload.body.mimeType).toBe('image/png');
        expect(upload.body.byteSize).toBe(1024);
        expect(upload.body.originalFilename).toBe('inspo.png');
        expect(upload.body.caption).toBe('huzurlu');
        expect(upload.body.storageObjectKey).toMatch(/references\//);
        expect(fakeStorageProxy.uploads.length).toBe(1);
        expect(fakeStorageProxy.uploads[0]!.body.length).toBe(1024);

        const list = await request(app.getHttpServer())
          .get(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie);
        expect(list.status).toBe(200);
        expect(list.body.items.length).toBe(1);
        expect(list.body.items[0].url).toMatch(/^https:\/\/fake\.storage\/signed\//);
        expect(list.body.items[0].urlExpiresAt).toBeDefined();
      } finally {
        await cleanup(sid);
      }
    });

    it('rejects a 12 MB upload with 400 UPLOAD_REJECTED and persists no partial state (DoD)', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        // 12 MB > MAX_UPLOAD_BYTES (10 MB).
        const oversized = makeJpegBuffer(12 * 1024 * 1024);
        const upload = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references/upload`)
          .set('Cookie', cookie)
          .attach('file', oversized, { filename: 'big.png', contentType: 'image/png' });
        expect(upload.status).toBe(400);
        expect(upload.body.error?.code).toBe('UPLOAD_REJECTED');

        // No partial state: list is empty.
        const list = await request(app.getHttpServer())
          .get(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie);
        expect(list.status).toBe(200);
        expect(list.body.items.length).toBe(0);
        // No storage upload was attempted.
        expect(fakeStorageProxy.uploads.length).toBe(0);
      } finally {
        await cleanup(sid);
      }
    });

    it('rejects unsupported MIME types with 400 UPLOAD_REJECTED', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const txt = Buffer.from('hello world');
        const upload = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references/upload`)
          .set('Cookie', cookie)
          .attach('file', txt, { filename: 'note.txt', contentType: 'text/plain' });
        expect(upload.status).toBe(400);
        expect(upload.body.error?.code).toBe('UPLOAD_REJECTED');
      } finally {
        await cleanup(sid);
      }
    });

    it('rolls back the placeholder row when storage upload fails', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        fakeStorageProxy.setFailureMode('STORAGE_FAILED');
        const small = makeJpegBuffer(512);
        const upload = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references/upload`)
          .set('Cookie', cookie)
          .attach('file', small, { filename: 'x.png', contentType: 'image/png' });
        expect(upload.status).toBe(400);
        expect(upload.body.error?.code).toBe('UPLOAD_REJECTED');

        // Rollback: no dangling references.
        const list = await request(app.getHttpServer())
          .get(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie);
        expect(list.body.items.length).toBe(0);
      } finally {
        fakeStorageProxy.setFailureMode('NONE');
        await cleanup(sid);
      }
    });
  });

  describe('DELETE', () => {
    it('removes a reference and is no longer listed', async () => {
      const { sid, cookie, roomId } = await bootstrap();
      try {
        const small = makeJpegBuffer(256);
        const add = await request(app.getHttpServer())
          .post(`/api/rooms/${roomId}/references/upload`)
          .set('Cookie', cookie)
          .attach('file', small, { filename: 'a.png', contentType: 'image/png' });
        // eslint-disable-next-line no-console
        console.log('ADD', add.status, JSON.stringify(add.body));
        const refId = add.body.id as string;
        // eslint-disable-next-line no-console
        console.log('REFID', refId);

        const del = await request(app.getHttpServer())
          .delete(`/api/references/${refId}`)
          .set('Cookie', cookie);
        // eslint-disable-next-line no-console
        console.log('DEL', del.status, JSON.stringify(del.body));
        expect(del.status).toBe(204);

        const list = await request(app.getHttpServer())
          .get(`/api/rooms/${roomId}/references`)
          .set('Cookie', cookie);
        expect(list.body.items.length).toBe(0);
      } finally {
        await cleanup(sid);
      }
    });

    it('returns 404 for a reference owned by another session (session isolation)', async () => {
      const { sid: sidA, cookie: cookieA, roomId: roomA } = await bootstrap();
      const sessionB = await request(app.getHttpServer()).get('/api/session');
      const cookieB = `sid=${sessionB.body.sessionId as string}`;
      try {
        const small = makeJpegBuffer(128);
        const add = await request(app.getHttpServer())
          .post(`/api/rooms/${roomA}/references/upload`)
          .set('Cookie', cookieA)
          .attach('file', small, { filename: 'a.png', contentType: 'image/png' });
        const refId = add.body.id as string;

        const del = await request(app.getHttpServer())
          .delete(`/api/references/${refId}`)
          .set('Cookie', cookieB);
        expect(del.status).toBe(404);
      } finally {
        await cleanup(sidA);
        await cleanup(sessionB.body.sessionId as string);
      }
    });
  });
});
