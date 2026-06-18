import { Inject, Injectable } from '@nestjs/common';
import { Room, RoomType } from '@prisma/client';
import { BaseRepository } from '../prisma/base.repository';
import { PrismaService } from '../prisma/prisma.service';
import { SessionContext } from '../sessions/session.context';

export interface RoomWithBrief extends Room {
  designBrief: {
    id: string;
    purpose: string | null;
    occupants: string | null;
    lightingPreferences: string | null;
    furnitureRequirements: string | null;
    constraints: string | null;
    updatedAt: Date;
  } | null;
}

@Injectable()
export class RoomsRepository extends BaseRepository {
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(SessionContext) sessionContext: SessionContext,
  ) {
    super(prisma, sessionContext);
  }

  async findByProjectId(projectId: string): Promise<Room[]> {
    return this.prisma.room.findMany({
      where: { projectId, sessionId: this.forSession().sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string): Promise<Room | null> {
    return this.forSession().findBySession(this.prisma.room, id);
  }

  async findByIdWithBrief(id: string): Promise<RoomWithBrief | null> {
    const room = await this.forSession().findBySession(this.prisma.room, id);
    if (!room) return null;
    return this.prisma.room.findUnique({
      where: { id: room.id },
      include: {
        designBrief: {
          select: {
            id: true,
            purpose: true,
            occupants: true,
            lightingPreferences: true,
            furnitureRequirements: true,
            constraints: true,
            updatedAt: true,
          },
        },
      },
    }) as Promise<RoomWithBrief | null>;
  }

  async findByProjectAndType(projectId: string, roomType: RoomType): Promise<Room | null> {
    return this.prisma.room.findFirst({
      where: { projectId, sessionId: this.forSession().sessionId, roomType },
    });
  }

  async create(projectId: string, roomType: RoomType): Promise<Room> {
    return this.prisma.room.create({
      data: {
        projectId,
        sessionId: this.forSession().sessionId,
        roomType,
      },
    });
  }

  async updateStatus(id: string, status: Room['status'], approvedGenerationId: string | null): Promise<Room> {
    return this.prisma.room.update({
      where: { id },
      data: { status, approvedGenerationId },
    });
  }

  async upsertBrief(
    roomId: string,
    data: {
      purpose?: string | null;
      occupants?: string | null;
      lightingPreferences?: string | null;
      furnitureRequirements?: string | null;
      constraints?: string | null;
    },
  ): Promise<RoomWithBrief['designBrief']> {
    return this.prisma.designBrief.upsert({
      where: { roomId },
      create: {
        roomId,
        purpose: data.purpose ?? null,
        occupants: data.occupants ?? null,
        lightingPreferences: data.lightingPreferences ?? null,
        furnitureRequirements: data.furnitureRequirements ?? null,
        constraints: data.constraints ?? null,
      },
      update: {
        ...(data.purpose !== undefined ? { purpose: data.purpose } : {}),
        ...(data.occupants !== undefined ? { occupants: data.occupants } : {}),
        ...(data.lightingPreferences !== undefined ? { lightingPreferences: data.lightingPreferences } : {}),
        ...(data.furnitureRequirements !== undefined ? { furnitureRequirements: data.furnitureRequirements } : {}),
        ...(data.constraints !== undefined ? { constraints: data.constraints } : {}),
      },
      select: {
        id: true,
        purpose: true,
        occupants: true,
        lightingPreferences: true,
        furnitureRequirements: true,
        constraints: true,
        updatedAt: true,
      },
    });
  }

  async findProjectSessionId(projectId: string): Promise<{ id: string; sessionId: string; status: string } | null> {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, sessionId: true, status: true },
    });
  }
}
