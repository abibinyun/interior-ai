import { Inject, Injectable } from '@nestjs/common';
import { Project, ProjectStatus } from '@prisma/client';
import { BaseRepository } from '../prisma/base.repository';
import { PrismaService } from '../prisma/prisma.service';
import { SessionContext } from '../sessions/session.context';

export interface ProjectWithRelations extends Project {
  styleProfile: {
    id: string;
    styleKey: string;
    styleNotes: string | null;
  } | null;
  rooms: Array<{
    id: string;
    roomType: string;
    status: string;
    approvedGenerationId: string | null;
    updatedAt: Date;
  }>;
}

@Injectable()
export class ProjectsRepository extends BaseRepository {
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(SessionContext) sessionContext: SessionContext,
  ) {
    super(prisma, sessionContext);
  }

  async list(): Promise<Project[]> {
    return this.forSession().findManyBySession(this.prisma.project, {
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Project | null> {
    return this.forSession().findBySession(this.prisma.project, id);
  }

  async findByIdWithRelations(id: string): Promise<ProjectWithRelations | null> {
    const project = await this.forSession().findBySession(this.prisma.project, id);
    if (!project) return null;
    return this.prisma.project.findUnique({
      where: { id: project.id },
      include: {
        styleProfile: { select: { id: true, styleKey: true, styleNotes: true } },
        rooms: {
          select: {
            id: true,
            roomType: true,
            status: true,
            approvedGenerationId: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }) as Promise<ProjectWithRelations | null>;
  }

  async findByName(name: string): Promise<Project | null> {
    return this.prisma.project.findFirst({
      where: { sessionId: this.forSession().sessionId, name },
    });
  }

  async create(data: { name: string; description?: string }): Promise<Project> {
    return this.prisma.project.create({
      data: {
        sessionId: this.forSession().sessionId,
        name: data.name,
        description: data.description ?? null,
      },
    });
  }

  async update(
    id: string,
    data: { name?: string; description?: string | null },
  ): Promise<Project> {
    return this.prisma.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
  }

  async updateStatus(id: string, status: ProjectStatus, completedAt: Date | null): Promise<Project> {
    return this.prisma.project.update({
      where: { id },
      data: { status, completedAt },
    });
  }

  async countRoomsByStatus(id: string): Promise<{ total: number; approved: number }> {
    const [total, approved] = await Promise.all([
      this.prisma.room.count({ where: { projectId: id } }),
      this.prisma.room.count({ where: { projectId: id, status: 'APPROVED' } }),
    ]);
    return { total, approved };
  }
}
