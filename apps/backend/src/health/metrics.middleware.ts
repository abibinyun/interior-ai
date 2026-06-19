import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { getMetrics } from './metrics-registry';

/**
 * Records request count + latency for every HTTP request.
 *
 * Excludes the metrics endpoint itself to avoid recursion.
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
    if (path === '/api/metrics' || path === '/metrics') {
      next();
      return;
    }
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedNs = Number(process.hrtime.bigint() - start);
      const elapsedSec = elapsedNs / 1e9;
      const route = this.normalizeRoute(req);
      const labels = { method: req.method ?? 'UNKNOWN', route, status: String(res.statusCode) };
      const metrics = getMetrics();
      metrics.httpRequestsTotal.inc(labels);
      metrics.httpRequestDuration.observe(labels, elapsedSec);
      if (res.statusCode >= 500) {
        metrics.httpRequestErrors.inc(labels);
      }
    });
    next();
  }

  private normalizeRoute(req: Request): string {
    const url = req.originalUrl ?? req.url ?? '/';
    return url.split('?')[0] ?? url;
  }
}
