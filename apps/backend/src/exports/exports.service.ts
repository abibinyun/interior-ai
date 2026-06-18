import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsRepository } from '../projects/projects.repository';
import { STORAGE_ADAPTER, StorageAdapter, buildExportKey } from '../storage/storage.adapter';
import { assembleBundle } from './bundle-assembler';
import { ExportsRepository } from './exports.repository';
import {
  BundleManifest,
  ListedExportBundle,
  SerializedExportBundle,
} from './types';
import { buildZip } from './zip-writer';

const MAX_VERSION_ATTEMPTS = 5;

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);
  private readonly env: string;
  private readonly downloadTtlSeconds: number;

  constructor(
    @Inject(ExportsRepository) private readonly exportsRepo: ExportsRepository,
    @Inject(ProjectsRepository) private readonly projectsRepo: ProjectsRepository,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.env = config.get<string>('NODE_ENV', 'development');
    this.downloadTtlSeconds = config.get<number>('EXPORT_DOWNLOAD_TTL_SECONDS', 900);
  }

  async create(projectId: string): Promise<SerializedExportBundle> {
    // 1. Verify project exists in this session, and is COMPLETED (rule E-01).
    const project = await this.projectsRepo.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.status !== 'COMPLETED') {
      throw new ValidationError('Project is not in COMPLETED state; cannot export.', {
        status: `Project status is ${project.status}`,
      });
    }

    // 2. Gather everything the assembler needs.
    //    We can't reuse findByIdWithRelations because its slim select
    //    omits createdAt / updatedAt; the assembler needs those for
    //    deterministic ordering and the manifest's generatedAt field.
    const projectFull = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        styleProfile: { select: { styleKey: true, styleNotes: true } },
        rooms: {
          select: {
            id: true,
            roomType: true,
            status: true,
            approvedGenerationId: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!projectFull) {
      throw new NotFoundError('Project not found.');
    }

    const roomsWithData = await Promise.all(
      projectFull.rooms.map(async (room) => {
        const [brief, references, approvedGeneration] = await Promise.all([
          this.prisma.designBrief.findUnique({ where: { roomId: room.id } }),
          this.prisma.reference.findMany({
            where: { roomId: room.id },
            orderBy: { createdAt: 'asc' },
          }),
          room.approvedGenerationId
            ? this.prisma.generation.findUnique({
                where: { id: room.approvedGenerationId },
                include: { room: false },
              })
            : Promise.resolve(null),
        ]);

        let approvedImageBuffer: Buffer | null = null;
        let approvedImageExt: string | null = null;
        if (approvedGeneration?.storageObjectKey) {
          try {
            approvedImageBuffer = await this.storage.download(approvedGeneration.storageObjectKey);
            approvedImageExt = extensionForMime(approvedGeneration.storageObjectKey);
          } catch (err) {
            this.logger.warn(
              { err, roomId: room.id, key: approvedGeneration.storageObjectKey },
              'approved image download failed; bundle will omit it',
            );
          }
        }

        const refsWithBinaries = await Promise.all(
          references.map(async (ref) => {
            let binaryBuffer: Buffer | null = null;
            if (ref.sourceType === 'UPLOADED' && ref.storageObjectKey) {
              try {
                binaryBuffer = await this.storage.download(ref.storageObjectKey);
              } catch (err) {
                this.logger.warn(
                  { err, refId: ref.id, key: ref.storageObjectKey },
                  'UPLOADED reference download failed; bundle will omit binary',
                );
              }
            }
            return { ref, binaryBuffer };
          }),
        );

        return {
          ...room,
          designBrief: brief,
          approvedGeneration,
          approvedImageBuffer,
          approvedImageExt,
          references: refsWithBinaries,
        };
      }),
    );

    // 3. Build the bundle.
    const assembled = assembleBundle({
      project: {
        id: projectFull.id,
        name: projectFull.name,
        description: projectFull.description,
        status: projectFull.status,
        createdAt: projectFull.createdAt,
        completedAt: projectFull.completedAt,
        updatedAt: projectFull.updatedAt,
      },
      styleProfile: projectFull.styleProfile,
      rooms: roomsWithData,
    });

    const zipBuffer = await buildZip(assembled.files);
    const zipByteSize = BigInt(zipBuffer.length);

    // 4. Append-only version: try insert with MAX+1; on UNIQUE collision
    //    (concurrent writer), retry with the new MAX+1.
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_VERSION_ATTEMPTS; attempt++) {
      const currentMax = await this.exportsRepo.maxVersion(projectId);
      const version = currentMax + 1;
      const storageKey = buildExportKey(this.env, projectId, version);

      try {
        await this.storage.upload({
          key: storageKey,
          body: zipBuffer,
          contentType: 'application/zip',
        });
      } catch (err) {
        this.logger.error({ err, projectId, version }, 'export ZIP upload failed');
        throw err;
      }

      try {
        const row = await this.exportsRepo.insert({
          projectId,
          version,
          storageObjectKey: storageKey,
          byteSize: zipByteSize,
          payload: assembled.manifest as unknown as Prisma.InputJsonValue,
        });
        return this.serialize(row, assembled.manifest);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'P2002') {
          // Unique violation on (project_id, version) — a concurrent
          // export beat us. Delete the ZIP we just uploaded and retry.
          this.logger.warn(
            { projectId, version },
            'version collision on export insert; retrying',
          );
          try {
            await this.storage.delete(storageKey);
          } catch (delErr) {
            this.logger.warn(
              { err: delErr, storageKey },
              'failed to delete orphan ZIP after version collision',
            );
          }
          lastErr = err;
          continue;
        }
        // Any other insert error: try to clean up the ZIP and rethrow.
        try {
          await this.storage.delete(storageKey);
        } catch (delErr) {
          this.logger.warn({ err: delErr, storageKey }, 'failed to delete ZIP after insert error');
        }
        throw err;
      }
    }
    throw new Error(
      `Could not allocate an export version after ${MAX_VERSION_ATTEMPTS} attempts: ${
        (lastErr as Error)?.message ?? 'unknown'
      }`,
    );
  }

  async listByProjectId(projectId: string): Promise<{ items: ListedExportBundle[] }> {
    const project = await this.projectsRepo.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    const rows = await this.exportsRepo.findByProjectId(projectId);
    return { items: rows.map(this.serializeListed) };
  }

  async getById(bundleId: string): Promise<SerializedExportBundle> {
    const row = await this.exportsRepo.findById(bundleId);
    if (!row) {
      throw new NotFoundError('Export bundle not found.');
    }
    let downloadUrl: string | undefined;
    let downloadUrlExpiresAt: string | undefined;
    try {
      const signed = await this.storage.signedUrl(row.storageObjectKey, this.downloadTtlSeconds);
      downloadUrl = signed.signedUrl;
      downloadUrlExpiresAt = signed.expiresAt.toISOString();
    } catch (err) {
      this.logger.warn({ err, bundleId }, 'signedUrl for export failed; returning without url');
    }
    return {
      id: row.id,
      projectId: row.projectId,
      version: row.version,
      byteSize: Number(row.byteSize),
      createdAt: row.createdAt.toISOString(),
      manifest: row.payload as unknown as BundleManifest,
      downloadUrl,
      downloadUrlExpiresAt,
    };
  }

  private serialize = (
    row: { id: string; projectId: string; version: number; byteSize: bigint; createdAt: Date; storageObjectKey: string },
    manifest: BundleManifest,
  ): SerializedExportBundle => ({
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    byteSize: Number(row.byteSize),
    createdAt: row.createdAt.toISOString(),
    manifest,
  });

  private serializeListed = (row: {
    id: string;
    projectId: string;
    version: number;
    byteSize: bigint;
    createdAt: Date;
  }): ListedExportBundle => ({
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    byteSize: Number(row.byteSize),
    createdAt: row.createdAt.toISOString(),
  });
}

/**
 * Determine the file extension for a generation's approved image from the
 * storage object key (which is `.../{generationId}.{ext}` per the storage
 * key builder in M7). Falls back to `png` for legacy keys.
 */
function extensionForMime(storageKey: string): string {
  const idx = storageKey.lastIndexOf('.');
  if (idx < 0) return 'png';
  return storageKey.slice(idx + 1) || 'png';
}
