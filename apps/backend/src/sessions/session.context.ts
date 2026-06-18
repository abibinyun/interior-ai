import { Injectable, Scope } from '@nestjs/common';
import { UnauthenticatedError } from '../common';

/**
 * Request-scoped container for the resolved session.
 *
 * Populated by `SessionGuard` at the start of every request, consumed by
 * `BaseRepository.forSession()` so subclasses never need to thread the
 * session id through their method signatures.
 *
 * One instance per request (NestJS REQUEST scope). The guard is the only
 * writer; downstream code is read-only.
 */
@Injectable({ scope: Scope.REQUEST })
export class SessionContext {
  private _sessionId: string | null = null;
  private _createdAt: Date | null = null;

  set(sessionId: string, createdAt: Date): void {
    this._sessionId = sessionId;
    this._createdAt = createdAt;
  }

  clear(): void {
    this._sessionId = null;
    this._createdAt = null;
  }

  get isAuthenticated(): boolean {
    return this._sessionId !== null;
  }

  get sessionId(): string {
    if (this._sessionId === null) {
      throw new UnauthenticatedError('No session in request context.');
    }
    return this._sessionId;
  }

  get createdAt(): Date {
    if (this._createdAt === null) {
      throw new UnauthenticatedError('No session in request context.');
    }
    return this._createdAt;
  }
}
