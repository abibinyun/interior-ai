import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { BaseRepository } from '../prisma/base.repository';

@Injectable()
export class SessionsRepository extends BaseRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Create-or-touch a session row by id. Idempotent on id.
   *
   * Sessions are anonymous (rule S-01..S-07). The id is generated upstream
   * by SessionService (M3); here we just persist.
   */
  async upsert(id: string): Promise<{ id: string; createdAt: Date; lastSeenAt: Date }> {
    const existing = await this.prisma.session.findUnique({ where: { id } });
    if (existing) {
      return this.prisma.session.update({
        where: { id },
        data: { lastSeenAt: new Date() },
        select: { id: true, createdAt: true, lastSeenAt: true },
      });
    }
    return this.prisma.session.create({
      data: { id },
      select: { id: true, createdAt: true, lastSeenAt: true },
    });
  }

  async findById(id: string): Promise<{ id: string; createdAt: Date } | null> {
    const row = await this.prisma.session.findUnique({
      where: { id },
      select: { id: true, createdAt: true },
    });
    return row;
  }
}
