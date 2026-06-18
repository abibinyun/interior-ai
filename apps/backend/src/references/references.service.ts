import { ConflictError, NotFoundError, UploadRejectedError, ValidationError } from '../common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reference, ReferenceSourceType, Room } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionContext } from '../sessions/session.context';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  STORAGE_ADAPTER,
  StorageAdapter,
  buildReferenceKey,
  isStorageError,
} from '../storage/storage.adapter';
import { AddReferenceDto } from './dto/add-reference.dto';
import { ReferencesRepository } from './references.repository';

/**
 * Subset of multer's Express.Multer.File we depend on. We declare it
 * locally so we don't depend on the global namespace augmentation
 * (which doesn't always resolve cleanly when the controller, service,
 * and multer types are loaded together).
 */
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadResult {
  id: string;
  url: string;
  expiresAt: Date;
}

export interface SerializedReference {
  id: string;
  roomId: string;
  sourceType: string;
  sourceId: string | null;
  storageObjectKey: string | null;
  externalUrl: string | null;
  mimeType: string | null;
  byteSize: number | null;
  originalFilename: string | null;
  caption: string | null;
  createdAt: string;
  // Populated only for UPLOADED references (signed URL response).
  url?: string;
  urlExpiresAt?: string;
}

@Injectable()
export class ReferencesService {
  private readonly logger = new Logger(ReferencesService.name);
  private readonly env: string;

  constructor(
    @Inject(ReferencesRepository) private readonly repo: ReferencesRepository,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SessionContext) private readonly sessionContext: SessionContext,
  ) {
    this.env = this.config.get<string>('NODE_ENV', 'development');
  }

  async listByRoomId(roomId: string): Promise<SerializedReference[]> {
    await this.assertRoomOwned(roomId);
    const refs = await this.repo.findByRoomId(roomId);
    return Promise.all(refs.map((r) => this.serialize(r)));
  }

  /**
   * Add a GENERATED or EXTERNAL_URL reference (Q5 — UPLOADED goes through
   * uploadReference instead).
   */
  async addReference(
    roomId: string,
    dto: AddReferenceDto,
  ): Promise<SerializedReference> {
    await this.assertRoomOwned(roomId);

    const sourceType = dto.sourceType as ReferenceSourceType;
    let sourceId: string | null = null;
    let externalUrl: string | null = null;

    if (sourceType === 'GENERATED') {
      if (!dto.sourceId) {
        throw new ValidationError('sourceId is required for sourceType=GENERATED.', {
          sourceId: 'required',
        });
      }
      const gen = await this.prisma.generation.findUnique({
        where: { id: dto.sourceId },
        select: { id: true, roomId: true, sessionId: true },
      });
      // Rule: a generation reference must belong to a generation in this room
      // AND in the same session (no cross-session leakage).
      if (!gen || gen.roomId !== roomId || gen.sessionId !== this.sessionContext.sessionId) {
        throw new NotFoundError('Generation not found in this room.');
      }
      sourceId = gen.id;
    } else if (sourceType === 'EXTERNAL_URL') {
      if (!dto.externalUrl) {
        throw new ValidationError('externalUrl is required for sourceType=EXTERNAL_URL.', {
          externalUrl: 'required',
        });
      }
      try {
        // class-validator's @IsUrl already validated format; double-check via URL constructor.
        new URL(dto.externalUrl);
      } catch {
        throw new ValidationError('externalUrl is not a valid URL.', {
          externalUrl: 'must be a parseable URL',
        });
      }
      externalUrl = dto.externalUrl;
    } else if (sourceType === 'UPLOADED') {
      // UPLOADED must go through the multipart endpoint so the storage layer
      // can validate MIME/size and persist the object_key.
      throw new ConflictError('Use POST .../references/upload for UPLOADED.');
    } else {
      throw new ValidationError(`Unsupported sourceType: ${sourceType}.`, {
        sourceType: 'must be one of GENERATED | EXTERNAL_URL | UPLOADED',
      });
    }

    const ref = await this.repo.create({
      roomId,
      sourceType,
      sourceId,
      externalUrl,
      caption: dto.caption ?? null,
    });
    return this.serialize(ref);
  }

  /**
   * Multipart upload for UPLOADED references (Q5).
   *
   * Validation order:
   *   1. Room ownership (session isolation).
   *   2. MIME type (must be one of ALLOWED_IMAGE_MIME_TYPES).
   *   3. Byte size (must be <= MAX_UPLOAD_BYTES).
   *   4. Storage upload.
   *   5. Reference row insertion (with storage_object_key from step 4).
   *
   * If any validation fails BEFORE storage upload succeeds, no Reference
   * row is created (DoD bullet: "without persisting partial state").
   */
  async uploadReference(
    roomId: string,
    file: UploadedFile,
    caption?: string,
  ): Promise<SerializedReference> {
    await this.assertRoomOwned(roomId);

    // Rule SG-06: MIME type whitelist.
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype as never)) {
      throw new UploadRejectedError(
        `Unsupported MIME type: ${file.mimetype}.`,
        { mimeType: 'Allowed: image/jpeg, image/png, image/webp.' },
      );
    }

    // Rule SG-06: max 10 MB.
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new UploadRejectedError(
        `File too large (${file.size} bytes > ${MAX_UPLOAD_BYTES}).`,
        { size: `Maximum allowed is ${MAX_UPLOAD_BYTES} bytes.` },
      );
    }

    const projectId = await this.getProjectIdForRoom(roomId);
    const safeFilename = file.originalname || 'upload';

    // Generate the id up-front so the storage object_key can be namespaced by it
    // (rules in docs/06-database-design.md: references/{projectId}/{roomId}/{referenceId}/{filename}).
    const referenceId = crypto.randomUUID();
    const key = buildReferenceKey(this.env, projectId, roomId, referenceId, safeFilename);

    try {
      await this.storage.upload({
        key,
        body: file.buffer,
        contentType: file.mimetype,
      });
    } catch (err) {
      // No partial state to roll back: the reference row is only inserted
      // after the upload succeeds.
      const code = isStorageError(err) ? err.code : 'UPLOAD_REJECTED';
      throw new UploadRejectedError((err as Error).message ?? 'Storage upload failed.', {
        reason: code,
      });
    }

    const ref = await this.repo.create({
      roomId,
      sourceType: 'UPLOADED',
      storageObjectKey: key,
      mimeType: file.mimetype,
      byteSize: BigInt(file.size),
      originalFilename: safeFilename,
      caption: caption ?? null,
    });

    return this.serialize(ref);
  }

  async delete(referenceId: string): Promise<void> {
    const ref = await this.repo.findById(referenceId);
    if (!ref) {
      throw new NotFoundError('Reference not found.');
    }
    // Session isolation: reference's room must belong to the current session.
    const room = await this.prisma.room.findUnique({
      where: { id: ref.roomId },
      select: { sessionId: true },
    });
    if (!room || room.sessionId !== this.sessionContext.sessionId) {
      throw new NotFoundError('Reference not found.');
    }

    // Best-effort storage delete; ignore failure (object may already be gone).
    if (ref.storageObjectKey) {
      try {
        await this.storage.delete(ref.storageObjectKey);
      } catch (err) {
        this.logger.warn(
          { refId: ref.id, err },
          'storage.delete failed; proceeding with reference row removal',
        );
      }
    }
    await this.repo.delete(referenceId);
  }

  private async requireOwnedRoom(roomId: string): Promise<Room | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, projectId: true, roomType: true, status: true, sessionId: true },
    });
    if (!room || room.sessionId !== this.sessionContext.sessionId) {
      return null;
    }
    return room as Room;
  }

  private async assertRoomOwned(roomId: string): Promise<void> {
    const room = await this.requireOwnedRoom(roomId);
    if (!room) {
      throw new NotFoundError('Room not found.');
    }
  }

  private async getProjectIdForRoom(roomId: string): Promise<string> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { projectId: true },
    });
    if (!room) throw new Error(`Room ${roomId} not found`);
    return room.projectId;
  }

  private async serialize(r: Reference): Promise<SerializedReference> {
    const base: SerializedReference = {
      id: r.id,
      roomId: r.roomId,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      storageObjectKey: r.storageObjectKey,
      externalUrl: r.externalUrl,
      mimeType: r.mimeType,
      byteSize: r.byteSize === null ? null : Number(r.byteSize),
      originalFilename: r.originalFilename,
      caption: r.caption,
      createdAt: r.createdAt.toISOString(),
    };
    // For UPLOADED references, attach a short-TTL signed URL per ADR-005 / Q5.
    if (r.sourceType === 'UPLOADED' && r.storageObjectKey) {
      try {
        const signed = await this.storage.signedUrl(
          r.storageObjectKey,
          this.config.get<number>('SIGNED_URL_TTL_SECONDS', 900),
        );
        base.url = signed.signedUrl;
        base.urlExpiresAt = signed.expiresAt.toISOString();
      } catch (err) {
        this.logger.warn({ refId: r.id, err }, 'signedUrl failed; returning ref without url');
      }
    }
    return base;
  }
}
