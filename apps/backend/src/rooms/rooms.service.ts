import { Inject, Injectable } from '@nestjs/common';
import {
  BusinessRuleViolationError,
  ConflictError,
  NotFoundError,
} from '../common';
import { SessionContext } from '../sessions/session.context';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateBriefDto } from './dto/update-brief.dto';
import { RoomWithBrief, RoomsRepository } from './rooms.repository';

@Injectable()
export class RoomsService {
  constructor(
    @Inject(RoomsRepository) private readonly repo: RoomsRepository,
    @Inject(SessionContext) private readonly sessionContext: SessionContext,
  ) {}

  async listByProject(projectId: string): Promise<{ items: unknown[] }> {
    await this.requireOwnedProject(projectId);
    const rooms = await this.repo.findByProjectId(projectId);
    return { items: rooms.map(this.serializeRoom) };
  }

  async create(projectId: string, dto: CreateRoomDto): Promise<unknown> {
    const project = await this.requireOwnedProject(projectId);
    if (project.status === 'COMPLETED') {
      throw new BusinessRuleViolationError('Cannot add rooms to a completed project.');
    }
    const existing = await this.repo.findByProjectAndType(projectId, dto.roomType);
    if (existing) {
      throw new ConflictError(`Room of type ${dto.roomType} already exists in this project.`);
    }
    const room = await this.repo.create(projectId, dto.roomType);
    return this.serializeRoom(room);
  }

  async get(roomId: string): Promise<unknown> {
    const room = await this.repo.findByIdWithBrief(roomId);
    if (!room) {
      throw new NotFoundError('Room not found.');
    }
    return this.serializeRoomWithBrief(room);
  }

  async updateBrief(roomId: string, dto: UpdateBriefDto): Promise<unknown> {
    const room = await this.repo.findById(roomId);
    if (!room) {
      throw new NotFoundError('Room not found.');
    }
    const project = await this.requireOwnedProject(room.projectId);
    if (project.status === 'COMPLETED') {
      throw new BusinessRuleViolationError('Cannot edit brief of a room in a completed project.');
    }
    const data: Parameters<RoomsRepository['upsertBrief']>[1] = {};
    if (dto.purpose !== undefined) data.purpose = dto.purpose?.trim() ?? null;
    if (dto.occupants !== undefined) data.occupants = dto.occupants?.trim() ?? null;
    if (dto.lightingPreferences !== undefined) data.lightingPreferences = dto.lightingPreferences?.trim() ?? null;
    if (dto.furnitureRequirements !== undefined) data.furnitureRequirements = dto.furnitureRequirements?.trim() ?? null;
    if (dto.constraints !== undefined) data.constraints = dto.constraints?.trim() ?? null;

    const brief = await this.repo.upsertBrief(roomId, data);

    if (room.status === 'APPROVED') {
      await this.repo.updateStatus(roomId, 'IN_REVIEW', null);
    }

    return {
      id: brief!.id,
      purpose: brief!.purpose,
      occupants: brief!.occupants,
      lightingPreferences: brief!.lightingPreferences,
      furnitureRequirements: brief!.furnitureRequirements,
      constraints: brief!.constraints,
      updatedAt: brief!.updatedAt.toISOString(),
    };
  }

  private async requireOwnedProject(projectId: string): Promise<{ id: string; status: string; sessionId: string }> {
    const project = await this.repo.findProjectSessionId(projectId);
    if (!project || project.sessionId !== this.sessionContext.sessionId) {
      throw new NotFoundError('Project not found.');
    }
    return project;
  }

  private serializeRoom = (r: { id: string; projectId: string; roomType: string; status: string; approvedGenerationId: string | null; createdAt: Date; updatedAt: Date }) => ({
    id: r.id,
    projectId: r.projectId,
    roomType: r.roomType,
    status: r.status,
    approvedGenerationId: r.approvedGenerationId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });

  private serializeRoomWithBrief = (r: RoomWithBrief) => ({
    ...this.serializeRoom(r),
    designBrief: r.designBrief
      ? {
          id: r.designBrief.id,
          purpose: r.designBrief.purpose,
          occupants: r.designBrief.occupants,
          lightingPreferences: r.designBrief.lightingPreferences,
          furnitureRequirements: r.designBrief.furnitureRequirements,
          constraints: r.designBrief.constraints,
          updatedAt: r.designBrief.updatedAt.toISOString(),
        }
      : null,
  });
}
