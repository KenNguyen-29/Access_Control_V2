import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService {
  private redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {
    const redisUrl = config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async check() {
    const checks = {
      postgres: false,
      redis: false as boolean | 'skipped',
      minio: false,
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }

    if (this.config.get<string>('REDIS_ENABLED') === 'false') {
      checks.redis = 'skipped';
    } else {
      try {
        await this.redis.connect();
        const pong = await this.redis.ping();
        checks.redis = pong === 'PONG';
        await this.redis.disconnect();
      } catch {
        checks.redis = false;
      }
    }

    checks.minio = await this.storage.ping();

    const healthy =
      checks.postgres &&
      (checks.redis === true || checks.redis === 'skipped') &&
      checks.minio;

    return {
      status: healthy ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
