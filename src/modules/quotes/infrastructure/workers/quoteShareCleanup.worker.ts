import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';

import { quoteShareConfig } from '../../../../config/quoteShare.config.js';
import { safeError } from '../../../../infrastructure/logging/safeError.js';
import { PrismaQuoteShareRateLimit } from '../rateLimits/prismaQuoteShareRateLimit.js';

@Injectable()
export class QuoteShareCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuoteShareCleanupWorker.name);

  private running?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(quoteShareConfig.KEY)
    private readonly configuration: ConfigType<typeof quoteShareConfig>,

    private readonly rateLimit: PrismaQuoteShareRateLimit,
  ) {}

  onModuleInit(): void {
    if (!this.configuration.cleanupWorkerEnabled) {
      return;
    }

    this.logger.log({
      message: 'Quote share cleanup worker enabled',
      schedule: CronExpression.EVERY_HOUR,
      timeZone: 'UTC',
      initialDelaySeconds: 60,
    });
  }

  @Timeout('quote-share-cleanup-initial', 60_000)
  handleInitialCleanup(): Promise<void> {
    return this.runCleanup();
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'quote-share-cleanup-hourly',
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
        this.logger.error({
          message: 'Quote share cleanup failed; retrying at the next scheduled execution',
          ...safeError(error),
        });
      })
      .finally(() => {
        this.running = undefined;
      });

    await this.running;
  }

  private async process(): Promise<void> {
    const startedAt = Date.now();
    let deleted = 0;

    for (let batch = 0; batch < 20; batch++) {
      if (this.stopping) {
        this.logger.log({
          message: 'Quote share cleanup interrupted by application shutdown',
          batches: batch,
          deleted,
          durationMs: Date.now() - startedAt,
        });

        return;
      }

      const count = await this.rateLimit.cleanup();

      deleted += count;

      if (count === 0) {
        this.logger.log({
          message: 'Quote share cleanup completed',
          batches: batch + 1,
          deleted,
          durationMs: Date.now() - startedAt,
        });

        return;
      }
    }

    this.logger.log({
      message: 'Quote share cleanup batch limit reached; continuing at the next scheduled execution',
      batches: 20,
      deleted,
      durationMs: Date.now() - startedAt,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    await this.running;

    if (this.configuration.cleanupWorkerEnabled) {
      this.logger.log('Quote share cleanup worker stopped');
    }
  }
}
