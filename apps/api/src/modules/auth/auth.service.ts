import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const account = await this.prisma.account.findFirst({
      where: { username: dto.username, isActive: true, isDeleted: false },
      include: { role: true },
    });

    if (!account) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, account.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: account.id,
      username: account.username,
      role: account.role.code,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      account: {
        id: account.id,
        username: account.username,
        role: account.role.code,
      },
    };
  }

  async refresh(userId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: userId, isActive: true, isDeleted: false },
      include: { role: true },
    });

    if (!account) {
      throw new UnauthorizedException('Account not found');
    }

    const payload = {
      sub: account.id,
      username: account.username,
      role: account.role.code,
    };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
