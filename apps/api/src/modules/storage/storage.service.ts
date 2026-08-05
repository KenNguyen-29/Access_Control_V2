import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import type { ReadStream } from 'fs';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;
  /** Root folder on disk for FaceID (PostgreSQL stores relative paths under this). */
  private uploadRoot!: string;
  private publicBaseUrl!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.uploadRoot = resolve(
      this.config.get<string>('FACE_UPLOAD_DIR') ||
        this.config.get<string>('UPLOAD_DIR') ||
        join(process.cwd(), 'uploads'),
    );
    mkdirSync(join(this.uploadRoot, 'face-images'), { recursive: true });
    this.logger.log(`Local upload dir: ${this.uploadRoot}`);

    const apiPort = this.config.get<string>('API_PORT', '8080');
    this.publicBaseUrl = (
      this.config.get<string>('API_PUBLIC_URL') || `http://localhost:${apiPort}`
    ).replace(/\/$/, '');

    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = this.config.get<string>('MINIO_PORT', '9000');
    const useSsl = this.config.get<string>('MINIO_USE_SSL', 'false') === 'true';
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'acv2-assets');

    this.client = new S3Client({
      endpoint: `${useSsl ? 'https' : 'http'}://${endpoint}:${port}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('MINIO_ACCESS_KEY', 'acv2minio'),
        secretAccessKey: this.config.get<string>('MINIO_SECRET_KEY', 'acv2minio123'),
      },
      forcePathStyle: true,
    });

    await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`MinIO bucket "${this.bucket}" ready`);
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`MinIO bucket "${this.bucket}" created`);
      } catch (err) {
        this.logger.warn(`MinIO bucket check failed: ${err}`);
      }
    }
  }

  /** Absolute path on disk for a relative key stored in PostgreSQL. */
  resolveLocalPath(relativePath: string): string {
    const cleaned = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    const absolute = resolve(this.uploadRoot, cleaned);
    const rootWithSep = this.uploadRoot.endsWith(sep) ? this.uploadRoot : `${this.uploadRoot}${sep}`;
    if (absolute !== this.uploadRoot && !absolute.startsWith(rootWithSep)) {
      throw new Error('Invalid file path');
    }
    return absolute;
  }

  /** Write file to hard disk; returns relative path to store in PostgreSQL. */
  saveToDisk(relativePath: string, body: Buffer): string {
    const cleaned = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    const absolute = this.resolveLocalPath(cleaned);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, body);
    return cleaned;
  }

  existsOnDisk(relativePath: string): boolean {
    try {
      return existsSync(this.resolveLocalPath(relativePath));
    } catch {
      return false;
    }
  }

  openLocalFile(relativePath: string): ReadStream {
    return createReadStream(this.resolveLocalPath(relativePath));
  }

  /** Absolute public base used for Akuvox FaceURL (LAN/VPN). */
  getPublicBaseUrl(): string {
    return this.publicBaseUrl;
  }

  /** Public HTTP URL for Akuvox FaceURL (file is served from disk). */
  getFileUrl(relativePath: string): string {
    const cleaned = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    return `${this.publicBaseUrl}/api/files/${cleaned}`;
  }

  /**
   * URL for browser/FE preview.
   * Prefer API_BROWSER_URL (local FE on localhost while API_PUBLIC_URL is LAN).
   * Otherwise use API_PUBLIC_URL — never default to localhost (breaks prod LAN UI).
   */
  getBrowserFileUrl(relativePath: string): string {
    const cleaned = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    const browserBase = (
      this.config.get<string>('API_BROWSER_URL') || this.publicBaseUrl
    ).replace(/\/$/, '');
    return `${browserBase}/api/files/${cleaned}`;
  }

  /** FaceID paths use local disk URL; other keys still use MinIO signed URL. */
  async getAssetUrl(key: string, opts?: { forBrowser?: boolean }): Promise<string> {
    const normalized = key.replace(/\\/g, '/');
    if (normalized.startsWith('face-images/')) {
      return opts?.forBrowser ? this.getBrowserFileUrl(normalized) : this.getFileUrl(normalized);
    }
    return this.getSignedUrl(key);
  }

  async uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  /** Delete objects under prefix whose LastModified is older than cutoff. */
  async deleteObjectsOlderThan(prefix: string, cutoff: Date): Promise<number> {
    let deleted = 0;
    let continuationToken: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const stale = (listed.Contents ?? []).filter(
        (obj) => obj.Key && obj.LastModified && obj.LastModified < cutoff,
      );
      for (let i = 0; i < stale.length; i += 1000) {
        const chunk = stale.slice(i, i + 1000);
        if (!chunk.length) continue;
        const res = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: chunk.map((o) => ({ Key: o.Key! })),
              Quiet: true,
            },
          }),
        );
        deleted += res.Deleted?.length ?? chunk.length;
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
    return deleted;
  }
}
