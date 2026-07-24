import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { successResponse } from '../../common/utils/response.util';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const REFRESH_COOKIE = 'acv2_refresh';

function clientIp(req: Request): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0]?.trim();
  return req.ip;
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieSecure(): boolean {
    return this.config.get<string>('COOKIE_SECURE', 'false') === 'true';
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.cookieSecure(),
      sameSite: 'lax',
      path: '/api/auth',
      maxAge,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.cookieSecure(),
      sameSite: 'lax',
      path: '/api/auth',
    });
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, result.refreshToken, new Date(result.refreshExpiresAt));
    const { refreshToken: _r, ...safe } = result;
    return successResponse(safe, 'Đăng nhập thành công');
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = readCookie(req, REFRESH_COOKIE);
    const result = await this.authService.refreshFromToken(raw, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, result.refreshToken, new Date(result.refreshExpiresAt));
    const { refreshToken: _r, ...safe } = result;
    return successResponse(safe, 'Làm mới phiên thành công');
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = readCookie(req, REFRESH_COOKIE);
    await this.authService.logout(raw);
    this.clearRefreshCookie(res);
    return successResponse({ ok: true }, 'Đã đăng xuất');
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  async changePassword(
    @Req() req: { user: { sub: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(req.user.sub, dto);
    return successResponse(result, 'Đã đổi mật khẩu');
  }
}
