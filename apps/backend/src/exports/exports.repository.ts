import { Inject, Injectable } from '@nestjs/common';
import { ExportBundle, Prisma } from '@prisma/client';
import { BaseRepository } from '../prisma/base.repository';
import { PrismaService } from '../prisma/prisma.service';
import { SessionContext } from '../sessions/session.context';

@Injectable()
export class ExportsRepository extends BaseRepository {
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(SessionContext) sessionContext: SessionContext,
  ) {
    super(prisma, sessionContext);
  }

  /**
   * Read the highest existing version for a project, scoped to the
   * current session. Returns 0 if no bundle exists yet.
   */
  async maxVersion(projectId: string): Promise<number> {
    const row = await this.prisma.exportBundle.aggregate({
      where: { projectId, sessionId: this.forSession().sessionId },
      _max: { version: true },
    });
    return row._max.version ?? 0;
  }

  async insert(data: {
    projectId: string;
    version: number;
    storageObjectKey: string;
    byteSize: bigint;
    payload: Prisma.InputJsonValue;
  }): Promise<ExportBundle> {
    return this.prisma.exportBundle.create({
      data: {
        projectId: data.projectId,
        sessionId: this.forSession().sessionId,
        version: data.version,
        storageObjectKey: data.storageObjectKey,
        byteSize: data.byteSize,
        payload: data.payload,
      },
    });
  }

  async findById(id: string): Promise<ExportBundle | null> {
    return this.forSession().findBySession(this.prisma.exportBundle, id);
  }

  async findByProjectId(projectId: string): Promise<ExportBundle[]> {
    return this.prisma.exportBundle.findMany({
      where: { projectId, sessionId: this.forSession().sessionId },
      orderBy: { version: 'desc' },
    });
  }
}
