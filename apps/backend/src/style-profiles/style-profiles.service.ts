import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionContext } from '../sessions/session.context';
import { findStyle, isValidStyleKey } from '../styles/styles.catalog';
import { SetStyleProfileDto } from './dto/set-style-profile.dto';
import { StyleProfilesRepository } from './style-profiles.repository';

@Injectable()
export class StyleProfilesService {
  constructor(
    @Inject(StyleProfilesRepository) private readonly repo: StyleProfilesRepository,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionContext) private readonly sessionContext: SessionContext,
  ) {}

  async get(projectId: string): Promise<unknown> {
    await this.requireOwnedProject(projectId);
    const profile = await this.repo.findByProjectId(projectId);
    if (!profile) {
      throw new NotFoundError('Style profile not set for this project.');
    }
    return this.serialize(profile);
  }

  async set(projectId: string, dto: SetStyleProfileDto): Promise<unknown> {
    await this.requireOwnedProject(projectId);
    if (!isValidStyleKey(dto.styleKey)) {
      throw new NotFoundError(`Unknown style key: ${dto.styleKey}`);
    }
    const entry = findStyle(dto.styleKey)!;
    // SCA-04: capture the previous styleKey BEFORE upsert so we can
    // detect a real change (insert or key-change). Notes-only edits
    // do not raise the warning.
    const previous = await this.repo.findByProjectId(projectId);
    const previousStyleKey = previous?.styleKey ?? null;
    const profile = await this.repo.upsert(projectId, {
      styleKey: dto.styleKey,
      styleNotes: dto.styleNotes?.trim() ?? null,
      colorTendenciesJson: entry.colorTendencies as unknown as Prisma.InputJsonValue,
      materialPrefsJson: entry.materialTendencies as unknown as Prisma.InputJsonValue,
    });
    // SCA-02 / SCA-04: when at least one room is approved, replacing
    // the style does NOT retroactively re-style those rooms. The
    // frontend surfaces a warning copy from Q4 in this case.
    const styleChanged = previousStyleKey !== profile.styleKey;
    const approvedCount = await this.prisma.room.count({
      where: { projectId, status: 'APPROVED' },
    });
    const styleChangeWarning = styleChanged && approvedCount > 0;
    return {
      ...this.serialize(profile),
      meta: {
        styleChangeWarning,
        approvedRoomCount: approvedCount,
      },
    };
  }

  private async requireOwnedProject(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, sessionId: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.sessionId !== this.sessionContext.sessionId) {
      throw new NotFoundError('Project not found.');
    }
  }

  private serialize = (p: { id: string; projectId: string; styleKey: string; styleNotes: string | null; colorTendenciesJson: unknown; materialPrefsJson: unknown; createdAt: Date; updatedAt: Date }) => ({
    id: p.id,
    projectId: p.projectId,
    styleKey: p.styleKey,
    styleNotes: p.styleNotes,
    colorTendencies: p.colorTendenciesJson,
    materialTendencies: p.materialPrefsJson,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  });
}
