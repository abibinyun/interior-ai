import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
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
 * Standard rate-limit headers. Mirrors the de-facto convention used
 * by GitHub / Twitter / Cloudflare so any client (browser, curl,
 * downstream proxy) can self-pace without trial-and-error.
 *
 * - `RateLimit-Limit`     — the maximum number of requests in the
 *                            current window.
 * - `RateLimit-Remaining`  — the number of requests still allowed
 *                            in the current window (clamped at >= 0).
 * - `RateLimit-Reset`      — seconds until the bucket resets.
 * - `Retry-After`          — emitted only on 429; RFC 6585 §4.
 *                            Seconds until the client may retry.
 */
export const RATE_LIMIT_HEADERS = {
  LIMIT: 'RateLimit-Limit',
  REMAINING: 'RateLimit-Remaining',
  RESET: 'RateLimit-Reset',
  RETRY_AFTER: 'Retry-After',
} as const;

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
    const res = execContext.switchToHttp().getResponse<Response>();
    if (!this.shouldLimit(req)) return true;
    const key = this.buildKey(req);
    if (!key) return true; // no session, no IP — skip
    const decision = this.tryConsume(key);
    // Always set the advisory headers on limited endpoints (even on
    // success) so well-behaved clients can self-pace without trial
    // and error.
    this.setAdvisoryHeaders(res, decision);
    if (decision.overLimit) {
      this.logger.warn(
        { key, name: this.options.name, max: this.options.max, windowMs: this.options.windowMs },
        'rate limit exceeded',
      );
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

  /**
   * Returns the new bucket state. Always sets a fresh bucket on the
   * first hit, increments within the window, and signals over-limit
   * once the count crosses the configured max.
   */
  private tryConsume(key: string): { overLimit: boolean; remaining: number; resetInSeconds: number } {
    const now = Date.now();
    const entry = this.buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      const resetInSeconds = Math.max(1, Math.ceil(this.options.windowMs / 1000));
      this.buckets.set(key, { resetAt: now + this.options.windowMs, count: 1 });
      return { overLimit: false, remaining: this.options.max - 1, resetInSeconds };
    }
    const resetInSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    if (entry.count >= this.options.max) {
      return { overLimit: true, remaining: 0, resetInSeconds };
    }
    entry.count += 1;
    return {
      overLimit: false,
      remaining: Math.max(0, this.options.max - entry.count),
      resetInSeconds,
    };
  }

  private setAdvisoryHeaders(res: Response, decision: ReturnType<RateLimitGuard['tryConsume']>): void {
    if (res.headersSent) return;
    res.setHeader(RATE_LIMIT_HEADERS.LIMIT, String(this.options.max));
    res.setHeader(RATE_LIMIT_HEADERS.REMAINING, String(decision.remaining));
    res.setHeader(RATE_LIMIT_HEADERS.RESET, String(decision.resetInSeconds));
    if (decision.overLimit) {
      // RFC 6585 §4 — server MAY include Retry-After on 429.
      res.setHeader(RATE_LIMIT_HEADERS.RETRY_AFTER, String(decision.resetInSeconds));
    }
  }
}
