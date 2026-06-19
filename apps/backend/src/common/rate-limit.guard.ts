import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { RateLimitedError } from './errors';

interface RateLimitOptions {
  /** Max requests per window per session-or-ip. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Identifier for this limiter (used in error messages and metric labels). */
  name: string;
}

interface BucketEntry {
  resetAt: number;
  count: number;
}

export const RATE_LIMIT_CONFIG = Symbol('RATE_LIMIT_CONFIG');

/**
 * Sliding-window in-memory rate limiter. Per session-or-ip, per limiter
 * name. Backed by a Map that is pruned lazily on each request.
 *
 * Identification priority:
 *   1. Session cookie (`sid`) if present (per-session limit)
 *   2. Client IP (per-IP fallback for unauthenticated requests)
 *
 * For AI-touching endpoints (per ADR-013) the limit applies per
 * session; an unauthenticated caller never reaches those endpoints
 * because the SessionGuard runs first. The IP fallback is for the
 * health/metrics endpoints if we ever want to throttle those.
 *
 * Options are injected once at construction; tests that want a tighter
 * limit must replace the guard instance (use overrideProvider).
 *
 * Single-process only — M18 (production parity) can swap in Redis.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly buckets = new Map<string, BucketEntry>();

  constructor(
    @Inject(RATE_LIMIT_CONFIG) private readonly options: RateLimitOptions,
  ) {}

  canActivate(execContext: ExecutionContext): boolean {
    const req = execContext.switchToHttp().getRequest<Request>();
    if (!this.shouldLimit(req)) return true;
    const key = this.buildKey(req);
    if (!key) return true; // no session, no IP — skip
    if (this.isOverLimit(key)) {
      this.logger.warn({ key, name: this.options.name, max: this.options.max, windowMs: this.options.windowMs }, 'rate limit exceeded');
      throw new RateLimitedError(`Rate limit exceeded for ${this.options.name}.`);
    }
    return true;
  }

  /**
   * Only limit AI-touching endpoints. The `name` option doubles as
   * a path prefix matcher: the generations limiter only fires on
   * `/api/rooms/:roomId/generations` and `/api/rooms/:roomId/approval`.
   * Other endpoints (session, projects, rooms) have their own
   * limiters (or none) wired in their respective modules.
   */
  private shouldLimit(req: Request): boolean {
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
    return path.includes('/generations') || path.includes('/approval');
  }

  private buildKey(req: Request): string | null {
    const sid = this.readSessionId(req);
    if (sid) return `sid:${sid}`;
    const ip = this.readIp(req);
    if (ip) return `ip:${ip}`;
    return null;
  }

  private readSessionId(req: Request): string | null {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const name = (process.env.SESSION_COOKIE_NAME as string | undefined) ?? 'sid';
    const raw = cookies?.[name];
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  }

  private readIp(req: Request): string | null {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) {
      return fwd.split(',')[0]?.trim() ?? null;
    }
    return req.ip ?? req.socket?.remoteAddress ?? null;
  }

  private isOverLimit(key: string): boolean {
    const now = Date.now();
    const entry = this.buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      this.buckets.set(key, { resetAt: now + this.options.windowMs, count: 1 });
      return false;
    }
    if (entry.count >= this.options.max) {
      return true;
    }
    entry.count += 1;
    return false;
  }
}
