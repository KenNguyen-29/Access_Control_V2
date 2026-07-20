import { Injectable } from '@nestjs/common';

export type RealtimeMetricsSnapshot = {
  lastWebhookAt: string | null;
  lastProcessedAt: string | null;
  lastEmitAt: string | null;
  lastSkipReason: string | null;
  lastAccessLogId: string | null;
  lastMode: 'queue' | 'sync' | null;
  lastJobId: string | null;
};

@Injectable()
export class RealtimeMetricsService {
  private lastWebhookAt: string | null = null;
  private lastProcessedAt: string | null = null;
  private lastEmitAt: string | null = null;
  private lastSkipReason: string | null = null;
  private lastAccessLogId: string | null = null;
  private lastMode: 'queue' | 'sync' | null = null;
  private lastJobId: string | null = null;

  markWebhook(meta?: { mode?: 'queue' | 'sync'; jobId?: string | null }) {
    this.lastWebhookAt = new Date().toISOString();
    if (meta?.mode) this.lastMode = meta.mode;
    if (meta?.jobId !== undefined) this.lastJobId = meta.jobId;
  }

  markProcessed(meta?: { accessLogId?: string; skipped?: boolean; reason?: string }) {
    this.lastProcessedAt = new Date().toISOString();
    if (meta?.accessLogId) this.lastAccessLogId = meta.accessLogId;
    this.lastSkipReason = meta?.skipped ? (meta.reason ?? 'skipped') : null;
  }

  markEmit(accessLogId?: string) {
    this.lastEmitAt = new Date().toISOString();
    if (accessLogId) this.lastAccessLogId = accessLogId;
  }

  snapshot(): RealtimeMetricsSnapshot {
    return {
      lastWebhookAt: this.lastWebhookAt,
      lastProcessedAt: this.lastProcessedAt,
      lastEmitAt: this.lastEmitAt,
      lastSkipReason: this.lastSkipReason,
      lastAccessLogId: this.lastAccessLogId,
      lastMode: this.lastMode,
      lastJobId: this.lastJobId,
    };
  }
}
