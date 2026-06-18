import { Inject, Injectable } from '@nestjs/common';
import {
  BusinessRuleViolationError,
  ConflictError,
  NotFoundError,
} from '../common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsRepository, ProjectWithRelations } from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(ProjectsRepository) private readonly repo: ProjectsRepository,
  ) {}

  async list(): Promise<{ items: unknown[] }> {
    const projects = await this.repo.list();
    return { items: projects.map(this.serialize) };
  }

  async get(id: string): Promise<unknown> {
    const project = await this.repo.findByIdWithRelations(id);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    return this.serializeWithRelations(project);
  }

  async create(dto: CreateProjectDto): Promise<unknown> {
    const name = dto.name.trim();
    const existing = await this.repo.findByName(name);
    if (existing) {
      throw new ConflictError(`Project name "${name}" already exists in this session.`);
    }
    const project = await this.repo.create({
      name,
      description: dto.description?.trim(),
    });
    return this.serialize(project);
  }

  async update(id: string, dto: UpdateProjectDto): Promise<unknown> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError('Project not found.');
    }
    if (existing.status === 'COMPLETED' && dto.name !== undefined) {
      throw new BusinessRuleViolationError(
        'Cannot rename a completed project. Reopen it first.',
      );
    }
    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (trimmed !== existing.name) {
        const nameClash = await this.repo.findByName(trimmed);
        if (nameClash) {
          throw new ConflictError(`Project name "${trimmed}" already exists in this session.`);
        }
      }
    }
    const updated = await this.repo.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() ?? null } : {}),
    });
    return this.serialize(updated);
  }

  async complete(id: string): Promise<unknown> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError('Project not found.');
    }
    if (existing.status === 'COMPLETED') {
      throw new BusinessRuleViolationError('Project is already completed.');
    }
    const { total, approved } = await this.repo.countRoomsByStatus(id);
    if (total === 0) {
      throw new BusinessRuleViolationError('Cannot complete a project with no rooms.');
    }
    if (total !== approved) {
      throw new BusinessRuleViolationError(
        `Cannot complete: ${total - approved} room(s) are not APPROVED.`,
      );
    }
    const updated = await this.repo.updateStatus(id, 'COMPLETED', new Date());
    return this.serialize(updated);
  }

  async reopen(id: string): Promise<unknown> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError('Project not found.');
    }
    if (existing.status !== 'COMPLETED') {
      throw new BusinessRuleViolationError('Project is not in COMPLETED state.');
    }
    const updated = await this.repo.updateStatus(id, 'IN_PROGRESS', null);
    return this.serialize(updated);
  }

  private serialize = (p: { id: string; name: string; description: string | null; status: string; createdAt: Date; updatedAt: Date; completedAt: Date | null }) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    completedAt: p.completedAt?.toISOString() ?? null,
  });

  private serializeWithRelations = (p: ProjectWithRelations) => ({
    ...this.serialize(p),
    styleProfile: p.styleProfile,
    rooms: p.rooms.map((r) => ({
      id: r.id,
      roomType: r.roomType,
      status: r.status,
      approvedGenerationId: r.approvedGenerationId,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}
