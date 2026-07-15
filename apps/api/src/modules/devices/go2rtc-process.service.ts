import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { firstValueFrom } from 'rxjs';

/**
 * Manages a local go2rtc process on the host. Running go2rtc on the host (not in a
 * container) keeps WebRTC ICE candidates reachable by the browser on the same machine.
 */
@Injectable()
export class Go2RtcProcessService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Go2RtcProcessService.name);
  private child: ChildProcess | null = null;
  private readonly autoStart: boolean;
  private readonly binaryPath: string;
  private readonly baseUrl: string;
  private readonly projectRoot: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.projectRoot = process.cwd();
    this.autoStart = config.get<string>('GO2RTC_AUTO_START', 'true') === 'true';
    this.baseUrl = config
      .get<string>('GO2RTC_BASE_URL', 'http://127.0.0.1:1984')
      .replace(/\/$/, '');

    const configuredBinary = config.get<string>('GO2RTC_BINARY_PATH')?.trim();
    if (configuredBinary) {
      this.binaryPath = configuredBinary;
    } else {
      const name = process.platform === 'win32' ? 'go2rtc.exe' : 'go2rtc';
      this.binaryPath = join(this.projectRoot, 'bin', name);
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.autoStart) {
      this.logger.log('go2rtc auto-start is disabled (GO2RTC_AUTO_START=false)');
      return;
    }
    if (await this.isReachable()) {
      this.logger.log(`go2rtc already reachable at ${this.baseUrl}`);
      return;
    }
    await this.startEmbedded();
  }

  onModuleDestroy(): void {
    this.stopEmbedded();
  }

  async ensureReady(): Promise<boolean> {
    if (await this.isReachable()) return true;
    if (!this.autoStart) return false;
    await this.startEmbedded();
    return this.isReachable();
  }

  private async startEmbedded(): Promise<void> {
    if (this.child) return;

    if (!existsSync(this.binaryPath)) {
      this.logger.error(
        `go2rtc binary not found at "${this.binaryPath}". ` +
          'Run: pnpm --filter @acv2/api go2rtc:install — or set GO2RTC_BINARY_PATH / start go2rtc manually.',
      );
      return;
    }

    this.logger.log(`Starting embedded go2rtc: ${this.binaryPath}`);

    this.child = spawn(this.binaryPath, [], {
      cwd: join(this.projectRoot, 'bin'),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    // Discard go2rtc stdout (noisy INF lines); only surface stderr failures.
    this.child.stdout?.resume();
    this.child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) this.logger.warn(`[go2rtc] ${line}`);
    });
    this.child.on('exit', (code, signal) => {
      this.logger.warn(`go2rtc process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
      this.child = null;
    });

    const ready = await this.waitUntilReady(20_000);
    if (ready) {
      this.logger.log(`Embedded go2rtc ready at ${this.baseUrl}`);
    } else {
      this.logger.error('Embedded go2rtc failed to become ready within 20s');
      this.stopEmbedded();
    }
  }

  private stopEmbedded(): void {
    if (!this.child) return;
    this.logger.log('Stopping embedded go2rtc');
    this.child.kill('SIGTERM');
    this.child = null;
  }

  private async isReachable(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.get(`${this.baseUrl}/api/streams`, { timeout: 1500 }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private async waitUntilReady(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isReachable()) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }
}
