import { Inject, Injectable } from '@nestjs/common';
import { Reference, ReferenceSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateReferenceInput {
  roomId: string;
  sourceType: ReferenceSourceType;
  sourceId?: string | null;
  storageObjectKey?: string | null;
  externalUrl?: string | null;
  mimeType?: string | null;
  byteSize?: bigint | null;
  originalFilename?: string | null;
  caption?: string | null;
}

@Injectable()
export class ReferencesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(input: CreateReferenceInput): Promise<Reference> {
    // Reference rows must carry the denormalized session_id (ADR-005).
    // The trigger reads it from the parent room.
    return this.prisma.reference.create({
      data: {
        roomId: input.roomId,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        storageObjectKey: input.storageObjectKey ?? null,
        externalUrl: input.externalUrl ?? null,
        mimeType: input.mimeType ?? null,
        byteSize: input.byteSize ?? null,
        originalFilename: input.originalFilename ?? null,
        caption: input.caption ?? null,
      },
    });
  }

  async findById(id: string): Promise<Reference | null> {
    return this.prisma.reference.findUnique({ where: { id } });
  }

  async findByRoomId(roomId: string): Promise<Reference[]> {
    return this.prisma.reference.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.reference.delete({ where: { id } });
  }
}
