import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RealtimeMetricsService } from '../events/realtime-metrics.service';
import { AKUVOX_QUEUE } from '../queue/queue.constants';
import { AkuvoxWebhookJobData } from '@acv2/shared';

@Injectable()
export class HealthService {
  private redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly metrics: RealtimeMetricsService,
    @Optional() @InjectQueue(AKUVOX_QUEUE) private readonly akuvoxQueue?: Queue<AkuvoxWebhookJobData>,
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

    const queue =
      this.akuvoxQueue != null
        ? await this.akuvoxQueue
            .getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
            .then((counts) => ({
              name: AKUVOX_QUEUE,
              waiting: counts.waiting ?? 0,
              active: counts.active ?? 0,
              completed: counts.completed ?? 0,
              failed: counts.failed ?? 0,
              delayed: counts.delayed ?? 0,
            }))
            .catch(() => ({
              name: AKUVOX_QUEUE,
              waiting: -1,
              active: -1,
              completed: -1,
              failed: -1,
              delayed: -1,
              error: true as const,
            }))
        : {
            name: AKUVOX_QUEUE,
            mode: 'sync' as const,
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
          };

    const realtime = this.metrics.snapshot();

    const healthy =
      checks.postgres &&
      (checks.redis === true || checks.redis === 'skipped') &&
      checks.minio;

    return {
      status: healthy ? 'ok' : 'degraded',
      checks,
      queue,
      realtime,
      timestamp: new Date().toISOString(),
    };
  }
}
