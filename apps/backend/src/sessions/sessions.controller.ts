import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { SessionsService } from './sessions.service';

@Controller('session')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Get()
  async getOrCreate(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ sessionId: string; createdAt: string }> {
    const existing = this.readCookie(req);
    const { id } = await this.sessions.issueOrRefresh(existing);
    this.writeCookie(req, res, id);
    const row = await this.sessions.findById(id);
    return {
      sessionId: id,
      createdAt: row?.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  private readCookie(req: Request): string | undefined {
    const raw = req.cookies?.[SessionsService.cookieName];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  }

  private writeCookie(req: Request, res: Response, id: string): void {
    // SESSION_COOKIE_SECURE:
    //   auto (default) — trust X-Forwarded-Proto (set by Traefik
    //                    behind cloudflared), fall back to req.secure.
    //   true / false   — force the flag regardless of the request.
    const mode = (this.config.get<string>('SESSION_COOKIE_SECURE', 'auto') ?? 'auto').toLowerCase();
    let isHttps: boolean;
    if (mode === 'true' || mode === '1') {
      isHttps = true;
    } else if (mode === 'false' || mode === '0') {
      isHttps = false;
    } else {
      const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.toLowerCase();
      isHttps = proto === 'https' || req.secure === true;
    }
    const sameSite = (this.config.get<string>('SESSION_COOKIE_SAMESITE', 'lax') ?? 'lax') as 'lax' | 'strict' | 'none';
    res.cookie(SessionsService.cookieName, id, {
      httpOnly: true,
      secure: isHttps,
      sameSite,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }
}
