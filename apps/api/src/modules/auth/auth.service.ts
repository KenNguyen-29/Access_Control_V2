import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectScopeService } from '../../common/services/project-scope.service';
import { resolveAllowedRoutes } from '@acv2/shared';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import type { JwtPayload } from './jwt.strategy';

type LoginAttempt = { count: number; firstAt: number; lockedUntil?: number };

@Injectable()
export class AuthService {
  /** In-memory rate limit: key = `${ip}|${username}` */
  private readonly attempts = new Map<string, LoginAttempt>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly projectScope: ProjectScopeService,
  ) {}

  private accessExpiresIn(): string {
    return this.config.get<string>('JWT_EXPIRES_IN', '15m');
  }

  private refreshTtlMs(): number {
    const raw = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const m = /^(\d+)([smhd])$/.exec(raw.trim());
    if (!m) return 7 * 24 * 60 * 60 * 1000;
    const n = Number(m[1]);
    const unit = m[2];
    const mult =
      unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return n * mult;
  }

  private attemptKey(ip: string | undefined, username: string) {
    return `${ip || 'unknown'}|${username.trim().toLowerCase()}`;
  }

  private assertNotRateLimited(ip: string | undefined, username: string) {
    const key = this.attemptKey(ip, username);
    const now = Date.now();
    const row = this.attempts.get(key);
    if (!row) return;
    if (row.lockedUntil && row.lockedUntil > now) {
      const waitSec = Math.ceil((row.lockedUntil - now) / 1000);
      throw new HttpException(
        `Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${waitSec}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedAttempt(ip: string | undefined, username: string) {
    const key = this.attemptKey(ip, username);
    const now = Date.now();
    const row = this.attempts.get(key) ?? { count: 0, firstAt: now };
    // Reset window after 15 minutes of quiet
    if (now - row.firstAt > 15 * 60_000) {
      row.count = 0;
      row.firstAt = now;
      row.lockedUntil = undefined;
    }
    row.count += 1;
    // Exponential backoff lock: 2^(count-5) seconds after 5 failures, capped 15 min
    if (row.count >= 5) {
      const exp = Math.min(15 * 60, Math.pow(2, row.count - 5));
      row.lockedUntil = now + exp * 1000;
    }
    this.attempts.set(key, row);
  }

  private clearAttempts(ip: string | undefined, username: string) {
    this.attempts.delete(this.attemptKey(ip, username));
  }

  private signAccess(payload: JwtPayload) {
    return this.jwtService.sign(payload, { expiresIn: this.accessExpiresIn() } as never);
  }

  private async buildAuthContext(account: {
    id: string;
    username: string;
    mustChangePassword: boolean;
    mfaEnabled: boolean;
    allowedRoutes?: unknown;
    role: { code: string };
  }) {
    const projectIds = await this.projectScope.loadProjectIdsForAccount(
      account.id,
      account.role.code,
    );
    const allowedRoutes = resolveAllowedRoutes(account.role.code, account.allowedRoutes);
    const payload: JwtPayload = {
      sub: account.id,
      username: account.username,
      role: account.role.code,
      ...(projectIds && projectIds.length ? { projectIds } : {}),
    };
    return {
      payload,
      account: {
        id: account.id,
        username: account.username,
        role: account.role.code,
        mustChangePassword: account.mustChangePassword,
        mfaEnabled: account.mfaEnabled,
        projectIds: projectIds ?? [],
        allowedRoutes,
      },
    };
  }

  async me(accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, isActive: true, isDeleted: false },
      include: { role: true },
    });
    if (!account) throw new UnauthorizedException('Tài khoản không hợp lệ');
    const ctx = await this.buildAuthContext(account);
    return ctx.account;
  }

  private hashToken(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  async issueRefreshToken(params: {
    accountId: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ refreshToken: string; expiresAt: Date }> {
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.refreshToken.create({
      data: {
        accountId: params.accountId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        ipAddress: params.ip,
        userAgent: params.userAgent?.slice(0, 255),
      },
    });
    return { refreshToken, expiresAt };
  }

  async login(
    dto: LoginDto,
    meta?: { ip?: string; userAgent?: string },
  ) {
    this.assertNotRateLimited(meta?.ip, dto.username);

    const account = await this.prisma.account.findFirst({
      where: { username: dto.username, isActive: true, isDeleted: false },
      include: { role: true },
    });

    if (!account) {
      this.recordFailedAttempt(meta?.ip, dto.username);
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }

    if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      throw new HttpException('Tài khoản đang bị khóa tạm thời', HttpStatus.TOO_MANY_REQUESTS);
    }

    const valid = await bcrypt.compare(dto.password, account.passwordHash);
    if (!valid) {
      this.recordFailedAttempt(meta?.ip, dto.username);
      await this.prisma.account.update({
        where: { id: account.id },
        data: { failedLoginCount: { increment: 1 } },
      });
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }

    this.clearAttempts(meta?.ip, dto.username);
    await this.prisma.account.update({
      where: { id: account.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const { payload, account: accountView } = await this.buildAuthContext(account);

    const accessToken = this.signAccess(payload);
    const { refreshToken, expiresAt } = await this.issueRefreshToken({
      accountId: account.id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt.toISOString(),
      mustChangePassword: account.mustChangePassword,
      mfaEnabled: account.mfaEnabled,
      /** MFA challenge not enforced yet — reserved for future step-up. */
      mfaRequired: false,
      account: accountView,
    };
  }

  async refreshFromToken(
    rawRefresh: string | undefined,
    meta?: { ip?: string; userAgent?: string },
  ) {
    if (!rawRefresh) {
      throw new UnauthorizedException('Thiếu refresh token');
    }
    const hash = this.hashToken(rawRefresh);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { account: { include: { role: true } } },
    });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }
    const account = stored.account;
    if (!account.isActive || account.isDeleted) {
      throw new UnauthorizedException('Tài khoản không hợp lệ');
    }

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const { payload, account: accountView } = await this.buildAuthContext(account);
    const accessToken = this.signAccess(payload);
    const { refreshToken, expiresAt } = await this.issueRefreshToken({
      accountId: account.id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt.toISOString(),
      mustChangePassword: account.mustChangePassword,
      account: accountView,
    };
  }

  async logout(rawRefresh: string | undefined, accountId?: string) {
    if (rawRefresh) {
      const hash = this.hashToken(rawRefresh);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: hash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (accountId) {
      await this.prisma.refreshToken.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async changePassword(accountId: string, dto: ChangePasswordDto) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, isActive: true, isDeleted: false },
    });
    if (!account) throw new UnauthorizedException('Tài khoản không hợp lệ');

    const valid = await bcrypt.compare(dto.currentPassword, account.passwordHash);
    if (!valid) throw new UnauthorizedException('Mật khẩu hiện tại không đúng');

    if (dto.newPassword.length < 8) {
      throw new ForbiddenException('Mật khẩu mới phải có ít nhất 8 ký tự');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new ForbiddenException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    // Revoke all refresh sessions after password change
    await this.prisma.refreshToken.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { ok: true, mustChangePassword: false };
  }
}
