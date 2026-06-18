import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SessionsRepository } from './sessions.repository';

const COOKIE_NAME = 'sid';

@Injectable()
export class SessionsService {
  constructor(private readonly repo: SessionsRepository) {}

  /**
   * Issue or refresh a session. Returns the session id; the caller
   * (controller) is responsible for writing the cookie.
   */
  async issueOrRefresh(existingId?: string): Promise<{ id: string; createdNow: boolean }> {
    const id = existingId && existingId.length > 0 ? existingId : randomUUID();
    const before = await this.repo.findById(id);
    await this.repo.upsert(id);
    return { id, createdNow: before === null };
  }

  async findById(id: string): Promise<{ id: string; createdAt: Date } | null> {
    return this.repo.findById(id);
  }

  static get cookieName(): string {
    return COOKIE_NAME;
  }
}
