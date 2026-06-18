import { Inject } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '../common';
import { SessionContext } from '../sessions/session.context';
import { PrismaService } from './prisma.service';

/**
 * Base class for all repositories. The single point of session isolation.
 *
 * Subclasses get a `prisma` client and a `forSession()` helper that pulls
 * the session id from the request-scoped `SessionContext` (populated by
 * `SessionGuard`). Every write/read against a session-scoped table MUST
 * go through this guard.
 *
 * Cross-session data access (rule S-05) is enforced at this layer, not at
 * the controller layer. The denormalized `session_id` columns (ADR-005) are
 * an independent defense layer, not a substitute for this one.
 */
export abstract class BaseRepository {
  protected constructor(
    @Inject(PrismaService) protected readonly prisma: PrismaService,
    @Inject(SessionContext) private readonly sessionContext: SessionContext,
  ) {}

  /**
   * Round-trip a trivial query to verify the database is reachable.
   * Useful for readiness checks at the repository layer.
   */
  async pingDatabase(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    return Array.isArray(rows) && rows.length > 0 && rows[0]?.ok === 1;
  }

  /**
   * Begin a session-scoped read/write scope.
   *
   * Resolves the session id from the request-scoped `SessionContext`
   * (populated by `SessionGuard`). Throws `UNAUTHENTICATED` if no session
   * is present. The returned `SessionScope` exposes `findBySession`,
   * `findManyBySession`, and `requireOwned` helpers. Subclasses may add
   * their own session-scoped methods on top.
   */
  protected forSession(): SessionScope {
    if (!this.sessionContext.isAuthenticated) {
      throw new ForbiddenError('No session in request context.');
    }
    return new SessionScope(this.sessionContext.sessionId);
  }
}

export class SessionScope {
  constructor(public readonly sessionId: string) {}

  /**
   * Find a row in a session-scoped table that carries a denormalized
   * `session_id` column. Returns null if missing OR if the row belongs to a
   * different session (no leakage, indistinguishable from "not found").
   *
   * Use for: rooms, generations, references, export_bundles.
   */
  async findBySession<T extends { sessionId: string | null }>(
    delegate: SessionScopedDelegate<T>,
    id: string,
  ): Promise<T | null> {
    const row = await delegate.findUnique({ where: { id } });
    if (!row) return null;
    if ((row as { sessionId: string | null }).sessionId !== this.sessionId) {
      return null;
    }
    return row as T;
  }

  /**
   * Find many rows in a session-scoped table, filtered by denormalized
   * `session_id`. Cheap because of the (session_id, ...) indexes.
   */
  async findManyBySession<T extends { sessionId: string | null }>(
    delegate: SessionScopedDelegate<T>,
    args: { where?: Record<string, unknown>; orderBy?: unknown; take?: number; skip?: number } = {},
  ): Promise<T[]> {
    const merged = {
      ...args,
      where: { ...(args.where ?? {}), sessionId: this.sessionId },
    };
    return (await delegate.findMany(merged as Parameters<typeof delegate.findMany>[0])) as T[];
  }

  /**
   * Find a row owned by the current session or throw 404. Hides existence
   * from other sessions.
   */
  async requireOwned<T extends { id: string; sessionId: string | null }>(
    delegate: SessionScopedDelegate<T>,
    id: string,
    label = 'Resource',
  ): Promise<T> {
    const row = await this.findBySession(delegate, id);
    if (!row) {
      throw new NotFoundError(`${label} not found.`);
    }
    return row;
  }
}

/**
 * Structural type for any Prisma delegate that exposes `findUnique` and
 * `findMany` and whose rows include a denormalized `sessionId` field.
 */
export interface SessionScopedDelegate<T> {
  findUnique(args: { where: { id: string } }): Promise<T | null>;
  findMany(args?: object): Promise<T[]>;
}
