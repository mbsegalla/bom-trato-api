import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';

import { authConfig } from '../../../../config/auth.config.js';
import type { AuthCleanupResult } from '../../application/types/auth.types.js';
import { CleanupAuthUseCase } from '../../application/useCases/cleanupAuth.useCase.js';

@Injectable()
export class AuthCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthCleanupWorker.name);

  private running?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(authConfig.KEY)
    private readonly configuration: ConfigType<typeof authConfig>,

    private readonly cleanupAuth: CleanupAuthUseCase,
  ) {}

  onModuleInit(): void {
    if (!this.configuration.cleanupWorkerEnabled) {
      return;
    }

    this.logger.log({
      message: 'Authentication cleanup worker enabled',
      schedule: CronExpression.EVERY_HOUR,
      timeZone: 'UTC',
      initialDelaySeconds: 60,
      retentionDays: this.configuration.retentionDays,
    });
  }

  @Timeout('auth-cleanup-initial', 60_000)
  handleInitialCleanup(): Promise<void> {
    return this.runCleanup();
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'auth-cleanup-hourly',
    timeZone: 'UTC',
    waitForCompletion: true,
  })
  handleScheduledCleanup(): Promise<void> {
    return this.runCleanup();
  }

  private async runCleanup(): Promise<void> {
    if (!this.configuration.cleanupWorkerEnabled || this.stopping || this.running !== undefined) {
      return;
    }

    this.running = this.process()
      .catch((error: unknown) => {
        this.logFailure(error);
      })
      .finally(() => {
        this.running = undefined;
      });

    await this.running;
  }

  private async process(): Promise<void> {
    const startedAt = Date.now();
    const now = new Date(startedAt);

    const totals: AuthCleanupResult = {
      refreshTokens: 0,
      sessions: 0,
      actionTokens: 0,
      rateLimits: 0,
    };

    for (let batch = 0; batch < 20; batch++) {
      if (this.stopping) {
        this.logger.log({
          message: 'Authentication cleanup interrupted by application shutdown',
          batches: batch,
          durationMs: Date.now() - startedAt,
          ...totals,
        });

        return;
      }

      const result = await this.cleanupAuth.execute(now);

      totals.refreshTokens += result.refreshTokens;
      totals.sessions += result.sessions;
      totals.actionTokens += result.actionTokens;
      totals.rateLimits += result.rateLimits;

      if (Object.values(result).every((count) => count === 0)) {
        this.logger.log({
          message: 'Authentication cleanup completed',
          batches: batch + 1,
          durationMs: Date.now() - startedAt,
          ...totals,
        });

        return;
      }
    }

    this.logger.log({
      message: 'Authentication cleanup batch limit reached; remaining records will be checked on the next run',
      batches: 20,
      durationMs: Date.now() - startedAt,
      ...totals,
    });
  }

  private logFailure(error: unknown): void {
    const rawCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

    const code =
      typeof rawCode === 'string' && /^(P[0-9]{4}|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(rawCode)
        ? rawCode
        : undefined;

    this.logger.error({
      message: 'Authentication cleanup failed; another attempt will run at the next scheduled execution',
      code,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    await this.running;

    if (this.configuration.cleanupWorkerEnabled) {
      this.logger.log('Authentication cleanup worker stopped');
    }
  }
}
