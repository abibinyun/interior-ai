import { Inject, Injectable } from '@nestjs/common';
import { Prisma, StyleProfile } from '@prisma/client';
import { BaseRepository } from '../prisma/base.repository';
import { PrismaService } from '../prisma/prisma.service';
import { SessionContext } from '../sessions/session.context';

@Injectable()
export class StyleProfilesRepository extends BaseRepository {
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(SessionContext) sessionContext: SessionContext,
  ) {
    super(prisma, sessionContext);
  }

  async findByProjectId(projectId: string): Promise<StyleProfile | null> {
    return this.prisma.styleProfile.findUnique({ where: { projectId } });
  }

  async upsert(
    projectId: string,
    data: { styleKey: string; styleNotes?: string | null; colorTendenciesJson?: Prisma.InputJsonValue; materialPrefsJson?: Prisma.InputJsonValue },
  ): Promise<StyleProfile> {
    return this.prisma.styleProfile.upsert({
      where: { projectId },
      create: {
        projectId,
        styleKey: data.styleKey,
        styleNotes: data.styleNotes ?? null,
        colorTendenciesJson: data.colorTendenciesJson ?? Prisma.JsonNull,
        materialPrefsJson: data.materialPrefsJson ?? Prisma.JsonNull,
      },
      update: {
        styleKey: data.styleKey,
        styleNotes: data.styleNotes ?? null,
        colorTendenciesJson: data.colorTendenciesJson ?? Prisma.JsonNull,
        materialPrefsJson: data.materialPrefsJson ?? Prisma.JsonNull,
      },
    });
  }
}
