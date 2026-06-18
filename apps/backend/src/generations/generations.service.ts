import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Generation, Room } from '@prisma/client';
import {
  BusinessRuleViolationError,
  ConflictError,
  NotFoundError,
} from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionContext } from '../sessions/session.context';
import { AnchorBuilder } from './anchor-builder';
import { StartBatchDto } from './dto/start-batch.dto';
import { GenerationsRepository } from './generations.repository';
import { PipelineOrchestrator } from './pipeline-orchestrator';
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
  private readonly logger = new Logger(GenerationsService.name);

  constructor(
    @Inject(GenerationsRepository) private readonly repo: GenerationsRepository,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PromptComposer) private readonly composer: PromptComposer,
    @Inject(PipelineOrchestrator) private readonly pipeline: PipelineOrchestrator,
    @Inject(AnchorBuilder) private readonly anchorBuilder: AnchorBuilder,
    @Inject(ConfigService) private readonly config: ConfigService,
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

    // CA-01..CA-05: server-computed consistency anchor (ADR-011).
    const consistencyAnchor = await this.anchorBuilder.build(room.projectId);

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
      consistencyAnchor: consistencyAnchor ?? undefined,
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

    // Fire-and-forget pipeline execution (ADR-014). Safe under concurrent
    // callers because PipelineOrchestrator.runBatch uses SELECT ... FOR
    // UPDATE SKIP LOCKED to claim rows atomically; a duplicate call will
    // simply skip already-claimed rows and return early.
    //
    // Disabled in tests (ENABLE_GENERATION_AUTO_TRIGGER=false) so that
    // e2e tests can manually drive the pipeline or override rows without
    // racing the auto-trigger.
    const autoTriggerEnabled = this.config.get<boolean>(
      'ENABLE_GENERATION_AUTO_TRIGGER',
      true,
    );
    const batchId = created[0]!.batchId;
    if (autoTriggerEnabled) {
      void this.pipeline.runBatch(batchId).catch((err: unknown) => {
        this.logger.error({ batchId, err }, 'pipeline.runBatch failed unexpectedly');
      });
    }

    return {
      batchId,
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

  /**
   * M12 — Approve a generation. Sets the room's approved_generation_id and
   * transitions its status to APPROVED. Rule A-01: only a COMPLETED
   * generation may be approved. Rule A-02/A-03: status/approvedGenerationId
   * invariant enforced by DB CHECK constraint rooms_approved_consistency_chk.
   */
  async approve(roomId: string, generationId: string): Promise<unknown> {
    await this.requireRoom(roomId);
    const gen = await this.prisma.generation.findUnique({
      where: { id: generationId },
      select: { id: true, roomId: true, status: true },
    });
    if (!gen || gen.roomId !== roomId) {
      throw new NotFoundError('Generation not found in this room.');
    }
    if (gen.status !== 'COMPLETED') {
      throw new ConflictError('Only a COMPLETED generation may be approved.');
    }
    return this.prisma.room.update({
      where: { id: roomId },
      data: { approvedGenerationId: generationId, status: 'APPROVED' },
    });
  }

  /**
   * M12 — Re-open an APPROVED room. Clears approved_generation_id and
   * transitions status back to IN_REVIEW (rule A-03 re-derived).
   * Generation rows are preserved (rule G-04 — immutable).
   *
   * Uses `requireRoom` (not `requireOwnedRoom`) so the APPROVED status
   * check does NOT short-circuit re-opening. The error envelope is
   * "Room is not APPROVED." to distinguish from "Cannot generate on an
   * APPROVED room" (which is the startBatch path).
   */
  async reopenRoom(roomId: string): Promise<unknown> {
    const room = await this.requireRoom(roomId);
    if (room.status !== 'APPROVED') {
      throw new ConflictError('Room is not APPROVED.');
    }
    return this.prisma.room.update({
      where: { id: roomId },
      data: { approvedGenerationId: null, status: 'IN_REVIEW' },
    });
  }

  private async requireRoom(roomId: string): Promise<Room> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, projectId: true, roomType: true, status: true, sessionId: true },
    });
    if (!room || room.sessionId !== this.sessionContext.sessionId) {
      throw new NotFoundError('Room not found.');
    }
    return room as Room;
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
