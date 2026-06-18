import { Inject, Injectable } from '@nestjs/common';
import { Generation, Room } from '@prisma/client';
import {
  BusinessRuleViolationError,
  ConflictError,
  NotFoundError,
} from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionContext } from '../sessions/session.context';
import { StartBatchDto } from './dto/start-batch.dto';
import { GenerationsRepository } from './generations.repository';
import { PromptComposer } from './prompt-composer';

export interface BatchResult {
  batchId: string;
  items: SerializedGeneration[];
}

export interface SerializedGeneration {
  id: string;
  batchId: string;
  roomId: string;
  optionIndex: number;
  parentGenerationId: string | null;
  status: string;
  prompt: string;
  negativePrompt: string | null;
  imageUrl: string | null;
  storageObjectKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class GenerationsService {
  constructor(
    @Inject(GenerationsRepository) private readonly repo: GenerationsRepository,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PromptComposer) private readonly composer: PromptComposer,
    @Inject(SessionContext) private readonly sessionContext: SessionContext,
  ) {}

  async startBatch(roomId: string, dto: StartBatchDto): Promise<BatchResult> {
    const room = await this.requireOwnedRoom(roomId);

    if (dto.parentGenerationId) {
      const parent = await this.repo.findById(dto.parentGenerationId);
      if (!parent || parent.roomId !== roomId) {
        throw new NotFoundError('Parent generation not found in this room.');
      }
      if (parent.status !== 'COMPLETED') {
        throw new BusinessRuleViolationError('Parent generation must be COMPLETED to refine.');
      }
    }

    const brief = await this.prisma.designBrief.findUnique({ where: { roomId } });
    const styleProfile = await this.prisma.styleProfile.findUnique({
      where: { projectId: room.projectId },
    });

    const composed = this.composer.compose({
      styleKey: styleProfile?.styleKey ?? null,
      styleNotes: styleProfile?.styleNotes ?? null,
      roomType: room.roomType,
      brief: {
        purpose: brief?.purpose ?? null,
        occupants: brief?.occupants ?? null,
        lightingPreferences: brief?.lightingPreferences ?? null,
        furnitureRequirements: brief?.furnitureRequirements ?? null,
        constraints: brief?.constraints ?? null,
      },
      briefOverride: dto.briefOverride,
      refinements: dto.refinements,
    });

    const items = composed.variations.map((v) => ({
      roomId,
      parentGenerationId: dto.parentGenerationId ?? null,
      prompt: v.prompt,
      negativePrompt: v.negativePrompt,
    }));

    const created = await this.repo.createBatch(items);
    if (created.length !== 3) {
      throw new Error('Batch creation invariant violated (G-01).');
    }
    void composed;

    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: 'GENERATING' },
    });

    return {
      batchId: created[0]!.batchId,
      items: created.map(this.serialize),
    };
  }

  async listByBatchId(batchId: string): Promise<SerializedGeneration[]> {
    const items = await this.repo.findByBatchId(batchId);
    return items.map(this.serialize);
  }

  async listByRoomId(roomId: string): Promise<SerializedGeneration[]> {
    await this.requireOwnedRoom(roomId);
    const items = await this.repo.findByRoomId(roomId);
    return items.map(this.serialize);
  }

  async listByBatchIdInRoom(
    roomId: string,
    batchId: string,
  ): Promise<SerializedGeneration[]> {
    await this.requireOwnedRoom(roomId);
    const items = await this.repo.findByBatchId(batchId);
    const owned = items.filter((g) => g.roomId === roomId);
    if (owned.length === 0) {
      throw new NotFoundError('Batch not found in this room.');
    }
    return owned.map(this.serialize);
  }

  async get(id: string): Promise<SerializedGeneration> {
    const gen = await this.repo.findById(id);
    if (!gen) throw new NotFoundError('Generation not found.');
    return this.serialize(gen);
  }

  async getLineage(generationId: string): Promise<{
    root: { id: string; optionIndex: number; createdAt: string };
    ancestors: Array<{ id: string; optionIndex: number; createdAt: string }>;
    descendants: Array<{ id: string; optionIndex: number; createdAt: string }>;
  }> {
    const gen = await this.repo.findById(generationId);
    if (!gen) throw new NotFoundError('Generation not found.');

    const [ancestors, descendants] = await Promise.all([
      this.repo.findAncestors(generationId),
      this.repo.findDescendants(generationId),
    ]);

    const summarize = (g: { id: string; optionIndex: number; createdAt: Date }) => ({
      id: g.id,
      optionIndex: g.optionIndex,
      createdAt: g.createdAt.toISOString(),
    });

    const root = ancestors[ancestors.length - 1];
    if (!root) throw new Error('Root generation missing from lineage query');

    return {
      root: summarize(root),
      ancestors: ancestors.slice(0, -1).reverse().map(summarize),
      descendants: descendants.slice(1).map(summarize),
    };
  }

  async markProcessing(id: string): Promise<void> {
    await this.repo.updateStatus(id, 'PROCESSING', {});
  }

  async markCompleted(id: string, imageUrl: string, storageObjectKey: string): Promise<Generation> {
    return this.repo.updateStatus(id, 'COMPLETED', { imageUrl, storageObjectKey });
  }

  async markFailed(id: string, code: string, message: string): Promise<Generation> {
    return this.repo.updateStatus(id, 'FAILED', { errorCode: code, errorMessage: message });
  }

  private async requireOwnedRoom(roomId: string): Promise<Room> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, projectId: true, roomType: true, status: true, sessionId: true },
    });
    if (!room || room.sessionId !== this.sessionContext.sessionId) {
      throw new NotFoundError('Room not found.');
    }
    if (room.status === 'APPROVED') {
      throw new ConflictError('Cannot generate on an APPROVED room. Re-open it first.');
    }
    return room as Room;
  }

  private serialize = (g: {
    id: string; batchId: string; roomId: string; optionIndex: number; parentGenerationId: string | null;
    status: string; prompt: string; negativePrompt: string | null; imageUrl: string | null;
    storageObjectKey: string | null; errorCode: string | null; errorMessage: string | null;
    createdAt: Date; updatedAt: Date;
  }): SerializedGeneration => ({
    id: g.id,
    batchId: g.batchId,
    roomId: g.roomId,
    optionIndex: g.optionIndex,
    parentGenerationId: g.parentGenerationId,
    status: g.status,
    prompt: g.prompt,
    negativePrompt: g.negativePrompt,
    imageUrl: g.imageUrl,
    storageObjectKey: g.storageObjectKey,
    errorCode: g.errorCode,
    errorMessage: g.errorMessage,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  });
}
