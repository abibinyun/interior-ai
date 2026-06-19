import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Sets a baseline of security headers on every response. Covers the
 * essentials from OWASP's "Secure Headers Project" without pulling in
 * the `helmet` dependency (which also brings a CSP engine we don't need
 * for a JSON API).
 *
 * Headers set:
 *   - X-Content-Type-Options: nosniff       (prevent MIME sniffing)
 *   - X-Frame-Options: DENY                 (prevent clickjacking)
 *   - Referrer-Policy: no-referrer          (no URL leakage)
 *   - Permissions-Policy: camera=(), microphone=(), geolocation=()
 *     (deny unused powerful features)
 *   - X-XSS-Protection: 0                   (disable legacy filter)
 *   - Strict-Transport-Security             (HSTS, only when behind TLS)
 *   - Cross-Origin-Resource-Policy: same-origin
 *
 * Skipped (intentionally):
 *   - Content-Security-Policy: a strict CSP is for HTML apps; this
 *     service serves JSON only and the frontend controls its own CSP.
 *   - Cross-Origin-Opener-Policy / Embedding-Policy: only matter for
 *     document contexts.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    );
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    if (this.isHttps(req)) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    next();
  }

  private isHttps(req: Request): boolean {
    const forwardedProto = req.headers['x-forwarded-proto'];
    if (typeof forwardedProto === 'string' && forwardedProto.toLowerCase() === 'https') {
      return true;
    }
    // req.secure is only present on requests that reached the TLS
    // terminator. CORS preflight (OPTIONS) requests sometimes arrive
    // without it — treat as plain HTTP.
    return req.secure === true;
  }
}
