import { Inject, Injectable } from '@nestjs/common';
import { Generation, GenerationStatus } from '@prisma/client';
import { BaseRepository } from '../prisma/base.repository';
import { PrismaService } from '../prisma/prisma.service';
import { SessionContext } from '../sessions/session.context';

export interface CreateBatchInput {
  roomId: string;
  parentGenerationId: string | null;
  prompt: string;
  negativePrompt?: string | null;
}

@Injectable()
export class GenerationsRepository extends BaseRepository {
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(SessionContext) sessionContext: SessionContext,
  ) {
    super(prisma, sessionContext);
  }

  async findByBatchId(batchId: string): Promise<Generation[]> {
    return this.prisma.generation.findMany({
      where: { batchId, sessionId: this.forSession().sessionId },
      orderBy: { optionIndex: 'asc' },
    });
  }

  async findById(id: string): Promise<Generation | null> {
    return this.forSession().findBySession(this.prisma.generation, id);
  }

  async createBatch(items: CreateBatchInput[]): Promise<Generation[]> {
    if (items.length !== 3) {
      throw new Error('Batch must contain exactly 3 generations (G-01).');
    }
    const sessionId = this.forSession().sessionId;
    const batchId = crypto.randomUUID();
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.generation.create({
          data: {
            roomId: item.roomId,
            sessionId,
            batchId,
            optionIndex: items.indexOf(item) + 1,
            parentGenerationId: item.parentGenerationId,
            prompt: item.prompt,
            negativePrompt: item.negativePrompt ?? null,
            status: 'PENDING',
          },
        }),
      ),
    );
  }

  async updateStatus(
    id: string,
    status: GenerationStatus,
    extras: { imageUrl?: string; storageObjectKey?: string; errorCode?: string | null; errorMessage?: string | null },
  ): Promise<Generation> {
    return this.prisma.generation.update({
      where: { id },
      data: {
        status,
        ...(extras.imageUrl !== undefined ? { imageUrl: extras.imageUrl } : {}),
        ...(extras.storageObjectKey !== undefined ? { storageObjectKey: extras.storageObjectKey } : {}),
        ...(extras.errorCode !== undefined ? { errorCode: extras.errorCode } : {}),
        ...(extras.errorMessage !== undefined ? { errorMessage: extras.errorMessage } : {}),
      },
    });
  }

  async findByRoomId(roomId: string): Promise<Generation[]> {
    return this.prisma.generation.findMany({
      where: { roomId, sessionId: this.forSession().sessionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async findAncestors(generationId: string): Promise<Generation[]> {
    const sessionId = this.forSession().sessionId;
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; roomId: string; sessionId: string; batchId: string;
      optionIndex: number; parentGenerationId: string | null;
      prompt: string; negativePrompt: string | null;
      imageUrl: string | null; storageObjectKey: string | null;
      status: GenerationStatus; errorCode: string | null; errorMessage: string | null;
      createdAt: Date; updatedAt: Date;
    }>>`
      WITH RECURSIVE ancestors AS (
        SELECT g.id, g.room_id AS "roomId", g.session_id AS "sessionId",
               g.batch_id AS "batchId", g.option_index AS "optionIndex",
               g.parent_generation_id AS "parentGenerationId",
               g.prompt, g.negative_prompt AS "negativePrompt",
               g.image_url AS "imageUrl", g.storage_object_key AS "storageObjectKey",
               g.status, g.error_code AS "errorCode", g.error_message AS "errorMessage",
               g.created_at AS "createdAt", g.updated_at AS "updatedAt", 0 AS depth
        FROM generations g
        WHERE g.id = ${generationId}::uuid
          AND g.session_id = ${sessionId}
        UNION ALL
        SELECT g.id, g.room_id AS "roomId", g.session_id AS "sessionId",
               g.batch_id AS "batchId", g.option_index AS "optionIndex",
               g.parent_generation_id AS "parentGenerationId",
               g.prompt, g.negative_prompt AS "negativePrompt",
               g.image_url AS "imageUrl", g.storage_object_key AS "storageObjectKey",
               g.status, g.error_code AS "errorCode", g.error_message AS "errorMessage",
               g.created_at AS "createdAt", g.updated_at AS "updatedAt", a.depth + 1
        FROM generations g
        JOIN ancestors a ON g.id = a."parentGenerationId"
        WHERE g.session_id = ${sessionId}
      )
      SELECT * FROM ancestors ORDER BY depth ASC
    `;
    return rows as unknown as Generation[];
  }

  async findDescendants(generationId: string): Promise<Generation[]> {
    const sessionId = this.forSession().sessionId;
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; roomId: string; sessionId: string; batchId: string;
      optionIndex: number; parentGenerationId: string | null;
      prompt: string; negativePrompt: string | null;
      imageUrl: string | null; storageObjectKey: string | null;
      status: GenerationStatus; errorCode: string | null; errorMessage: string | null;
      createdAt: Date; updatedAt: Date;
    }>>`
      WITH RECURSIVE descendants AS (
        SELECT g.id, g.room_id AS "roomId", g.session_id AS "sessionId",
               g.batch_id AS "batchId", g.option_index AS "optionIndex",
               g.parent_generation_id AS "parentGenerationId",
               g.prompt, g.negative_prompt AS "negativePrompt",
               g.image_url AS "imageUrl", g.storage_object_key AS "storageObjectKey",
               g.status, g.error_code AS "errorCode", g.error_message AS "errorMessage",
               g.created_at AS "createdAt", g.updated_at AS "updatedAt", 0 AS depth
        FROM generations g
        WHERE g.id = ${generationId}::uuid
          AND g.session_id = ${sessionId}
        UNION ALL
        SELECT g.id, g.room_id AS "roomId", g.session_id AS "sessionId",
               g.batch_id AS "batchId", g.option_index AS "optionIndex",
               g.parent_generation_id AS "parentGenerationId",
               g.prompt, g.negative_prompt AS "negativePrompt",
               g.image_url AS "imageUrl", g.storage_object_key AS "storageObjectKey",
               g.status, g.error_code AS "errorCode", g.error_message AS "errorMessage",
               g.created_at AS "createdAt", g.updated_at AS "updatedAt", d.depth + 1
        FROM generations g
        JOIN descendants d ON g.parent_generation_id = d.id
        WHERE g.session_id = ${sessionId}
      )
      SELECT * FROM descendants ORDER BY depth ASC
    `;
    return rows as unknown as Generation[];
  }
}
