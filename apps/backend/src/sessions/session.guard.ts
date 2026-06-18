import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { UnauthenticatedError } from '../common';
import { SessionsService } from './sessions.service';
import { SessionContext } from './session.context';

/**
 * Global session guard. Resolves the `sid` cookie, loads the session row,
 * and populates the request-scoped `SessionContext`. Throws 401 if the
 * cookie is missing or the session is not found.
 *
 * Applied per-controller via `@UseGuards(SessionGuard)`. Public routes
 * simply do not apply the guard (e.g. health, session creation).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new Logger(SessionGuard.name);

  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(SessionContext) private readonly context: SessionContext,
  ) {}

  async canActivate(execContext: ExecutionContext): Promise<boolean> {
    const req = execContext.switchToHttp().getRequest<Request>();
    const existing = this.readCookie(req);

    if (!existing) {
      throw new UnauthenticatedError('Missing session cookie.');
    }

    const { id, createdNow } = await this.sessions.issueOrRefresh(existing);

    if (createdNow) {
      this.logger.warn(
        { sessionId: id },
        'Session id present in cookie but not in DB; refreshed',
      );
    }

    const row = await this.sessions.findById(id);
    if (!row) {
      throw new UnauthenticatedError('Session not found.');
    }

    this.context.set(row.id, row.createdAt);
    return true;
  }

  private readCookie(req: Request): string | undefined {
    const raw = req.cookies?.[SessionsService.cookieName];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  }
}
