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
    this.writeCookie(res, id);
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

  private writeCookie(res: Response, id: string): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    res.cookie(SessionsService.cookieName, id, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    });
  }
}
