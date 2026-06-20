import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { STORAGE_ADAPTER, StorageAdapter } from '../storage/storage.adapter';
import { SessionGuard } from '../sessions/session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SessionContext } from '../sessions/session.context';
import type { Room } from '@prisma/client';

/**
 * Image proxy endpoint.
 *
 * Why this exists:
 *   The Supabase signed URLs the storage adapter generates are
 *   cross-origin. Chrome's Opaque Response Blocking (ORB) refuses
 *   to render cross-origin `<img>` elements unless the response sets
 *   `Cross-Origin-Resource-Policy: cross-origin` or a permissive
 *   CORS header. Supabase Storage's signed-URL responses don't
 *   always include either, which manifests as broken-image icons in
 *   the browser (even when `fetch()` from JS works fine).
 *
 *   We proxy the image bytes through the backend so they appear as
 *   same-origin (the browser loads `/api/.../image` which nginx
 *   forwards to this handler). This sidesteps ORB entirely.
 *
 * Authorization:
 *   SessionGuard + ownership check via the room's sessionId. The
 *   proxy refuses to serve an image whose room belongs to a
 *   different session (so the bucket key is not leaked cross-session
 *   even via timing analysis).
 *
 * Performance:
 *   The storage adapter's `download()` returns a Buffer. We stream
 *   it once via StreamableFile so we don't double-buffer in
 *   memory. Content-Length + Content-Type come from a HEAD to the
 *   storage provider when available; otherwise we omit them and the
 *   browser uses chunked transfer encoding.
 */
@Controller('images')
@UseGuards(SessionGuard)
export class ImagesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly sessionContext: SessionContext,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  @Get('generations/:generationId')
  async getGenerationImage(
    @Param('generationId', new ParseUUIDPipe()) generationId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const gen = await this.prisma.generation.findUnique({
      where: { id: generationId },
      include: { room: true },
    });
    if (!gen || gen.status !== 'COMPLETED' || !gen.storageObjectKey) {
      throw new NotFoundException('Image not available.');
    }
    this.assertOwnedRoom(gen.room);

    let bytes = await this.storage.download(gen.storageObjectKey);
    bytes = maybeDecodeLegacyBase64(bytes);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Same-origin, so ORB doesn't apply; this header is defensive in
    // case a future proxy in front of nginx changes the origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    return new StreamableFile(bytes);
  }

  private assertOwnedRoom(room: Pick<Room, 'id' | 'sessionId'>): void {
    if (room.sessionId !== this.sessionContext.sessionId) {
      // Treat as not-found rather than leaking the existence of the
      // generation via a 403 vs 404 distinction.
      throw new NotFoundException('Image not available.');
    }
  }
}

/**
 * Detect and decode legacy uploads that were stored as base64 strings
 * (an earlier bug in `SupabaseStorageAdapter.upload` base64-encoded
 * the bytes before sending, so Supabase stored the literal ASCII).
 *
 * New uploads send raw bytes and pass through unchanged. Heuristic:
 *   - A raw JPEG starts with `FF D8 FF` and a raw PNG with `89 50 4E 47`.
 *   - A base64-encoded JPEG starts with ASCII `/9j/` and a base64-encoded
 *     PNG with `iVBOR`.
 *   - If the body starts with `/9j/` or `iVBOR` AND every byte is a
 *     valid base64 alphabet char AND the length is a multiple of 4,
 *     treat it as legacy base64 and decode.
 *
 * This is conservative — false positives (decoding a non-image string)
 * would just produce garbage that the browser fails to render as an
 * image; the `onError` fallback in `GenerationCard` shows the
 * "Image could not be loaded" placeholder.
 */
export function maybeDecodeLegacyBase64(bytes: Buffer): Buffer {
  if (bytes.length === 0) return bytes;
  if (looksLikeRawImage(bytes)) return bytes;

  const head = bytes.subarray(0, 5).toString('ascii');
  if (!head.startsWith('/9j/') && !head.startsWith('iVBOR')) {
    return bytes;
  }
  if (!isValidBase64(bytes)) {
    return bytes;
  }
  if (bytes.length % 4 !== 0) {
    return bytes;
  }

  try {
    return Buffer.from(bytes.toString('ascii'), 'base64');
  } catch {
    return bytes;
  }
}

function looksLikeRawImage(bytes: Buffer): boolean {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  return false;
}

function isValidBase64(bytes: Buffer): boolean {
  const re = /^[A-Za-z0-9+/]+={0,2}$/;
  return re.test(bytes.toString('ascii'));
}