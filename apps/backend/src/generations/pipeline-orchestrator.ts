import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER_ADAPTER, AiProviderAdapter, GenerationRequest, GenerationResult, isProviderError } from '../ai/adapters/ai-provider.adapter';
import { MyceliAdapter } from '../ai/adapters/myceli.adapter';
import { PollinationsAdapter } from '../ai/adapters/pollinations.adapter';
import { PrismaService } from '../prisma/prisma.service';
import { buildGenerationKey, STORAGE_ADAPTER, StorageAdapter } from '../storage/storage.adapter';

export interface PipelineResult {
  batchId: string;
  completed: number;
  failed: number;
  allFailed: boolean;
}

interface GenerationRow {
  id: string;
  roomId: string;
  prompt: string;
  negativePrompt: string | null;
}

/**
 * Orchestrates a generation batch:
 *   1. Claim rows for processing with SELECT ... FOR UPDATE SKIP LOCKED
 *      (Postgres). This prevents two concurrent runBatch() invocations from
 *      fighting over the same PENDING rows (ADR-014).
 *   2. For each claimed row, call the active AI adapter.
 *   3. On transient error (PROVIDER_TIMEOUT, PROVIDER_BROKEN), one fallback
 *      attempt against the other adapter (AI-07).
 *   4. On success, upload the image buffer to storage; on storage failure,
 *      mark FAILED with STORAGE_FAILED (SG-03).
 *   5. On non-transient error (PROVIDER_REJECTED), no fallback; mark FAILED.
 *   6. Update room status: IN_REVIEW if at least one completed, GENERATING
 *      kept if all failed (G-10 — never silently discarded).
 *
 * Idempotency: if a row is already in PROCESSING / COMPLETED / FAILED it is
 * skipped, even without the row lock. This makes it safe for callers that
 * cannot use the transaction (e.g. simple admin endpoints) to retry.
 */
@Injectable()
export class PipelineOrchestrator {
  private readonly logger = new Logger(PipelineOrchestrator.name);
  private readonly env: string;

  constructor(
    @Inject(AI_PROVIDER_ADAPTER) private readonly activeAdapter: AiProviderAdapter,
    @Inject(PollinationsAdapter) private readonly pollinations: PollinationsAdapter,
    @Inject(MyceliAdapter) private readonly myceli: MyceliAdapter,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(ConfigService) config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    this.env = config.get<string>('NODE_ENV', 'development');
  }

  async runBatch(batchId: string): Promise<PipelineResult> {
    // Step 1: Claim PENDING rows with row-level locks. SKIP LOCKED ensures
    // concurrent runBatch invocations don't double-process; rows already
    // claimed by a peer are simply skipped by this caller.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        room_id: string;
        prompt: string;
        negative_prompt: string | null;
      }>>`
        SELECT id, room_id, prompt, negative_prompt
        FROM generations
        WHERE "batch_id" = ${batchId}::uuid
          AND status = 'PENDING'
        FOR UPDATE SKIP LOCKED
      `;
      // Immediately flip the status to PROCESSING inside the same transaction
      // so the lock + state transition are atomic.
      if (rows.length > 0) {
        await tx.generation.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { status: 'PROCESSING' },
        });
      }
      return rows.map((r) => ({
        id: r.id,
        roomId: r.room_id,
        prompt: r.prompt,
        negativePrompt: r.negative_prompt,
      }));
    });

    if (claimed.length === 0) {
      return { batchId, completed: 0, failed: 0, allFailed: false };
    }

    const roomId = claimed[0]!.roomId;
    const projectId = await this.getProjectIdForRoom(roomId);

    let completed = 0;
    let failed = 0;

    for (const row of claimed) {
      const ok = await this.runOne(row, projectId);
      if (ok) completed += 1;
      else failed += 1;
    }

    const allFailed = completed === 0;
    if (!allFailed) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: 'IN_REVIEW' },
      });
    }

    return { batchId, completed, failed, allFailed };
  }

  private async runOne(gen: GenerationRow, projectId: string): Promise<boolean> {
    const request: GenerationRequest = {
      prompt: gen.prompt,
      ...(gen.negativePrompt ? { negativePrompt: gen.negativePrompt } : {}),
    };

    let result: GenerationResult | null = null;
    let lastError: { code: string; message: string } | null = null;

    try {
      result = await this.activeAdapter.generate(request);
    } catch (err) {
      lastError = this.mapProviderError(err);
      this.logger.warn({ generationId: gen.id, err: lastError }, 'primary adapter failed');
    }

    if (!result && this.shouldFallback(lastError)) {
      const fallback = this.activeAdapter.name === 'pollinations' ? this.myceli : this.pollinations;
      this.logger.warn({ generationId: gen.id, fallback: fallback.name }, 'attempting fallback (AI-07)');
      try {
        result = await fallback.generate(request);
        lastError = null;
      } catch (err) {
        lastError = this.mapProviderError(err);
        this.logger.warn({ generationId: gen.id, err: lastError }, 'fallback adapter failed');
      }
    }

    if (!result) {
      const code = lastError?.code ?? 'PROVIDER_BROKEN';
      const message = lastError?.message ?? 'Unknown provider error.';
      this.logger.warn({ generationId: gen.id, code, message, lastError }, 'marking FAILED');
      await this.markFailed(gen.id, code, message);
      return false;
    }

    const key = buildGenerationKey(this.env, projectId, gen.roomId, gen.id, result.contentType);
    try {
      const upload = await this.storage.upload({
        key,
        body: result.imageBuffer,
        contentType: result.contentType,
      });
      await this.markCompleted(gen.id, upload.publicUrl, upload.key);
      return true;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      const code = e.code ?? 'STORAGE_FAILED';
      const message = e.message ?? 'Storage upload failed.';
      await this.markFailed(gen.id, code, message);
      this.logger.error({ generationId: gen.id, err: e }, 'storage upload failed (SG-03)');
      return false;
    }
  }

  private async markCompleted(id: string, imageUrl: string, storageObjectKey: string): Promise<void> {
    await this.prisma.generation.update({
      where: { id },
      data: { status: 'COMPLETED', imageUrl, storageObjectKey },
    });
  }

  private async markFailed(id: string, code: string, message: string): Promise<void> {
    await this.prisma.generation.update({
      where: { id },
      data: { status: 'FAILED', errorCode: code, errorMessage: message },
    });
  }

  private async getProjectIdForRoom(roomId: string): Promise<string> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId }, select: { projectId: true } });
    if (!room) throw new Error(`Room ${roomId} not found`);
    return room.projectId;
  }

  private shouldFallback(err: { code: string } | null): boolean {
    if (!err) return false;
    return err.code === 'PROVIDER_TIMEOUT' || err.code === 'PROVIDER_BROKEN';
  }

  private mapProviderError(err: unknown): { code: string; message: string } {
    if (isProviderError(err)) {
      return { code: err.code, message: err.message };
    }
    return { code: 'PROVIDER_BROKEN', message: (err as Error)?.message ?? 'Unknown error.' };
  }
}
