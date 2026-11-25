import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { notificationConfig } from '../../../../config/notification.config.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readTransaction } from '../../../../infrastructure/database/prismaTransaction.js';
import { safeError } from '../../../../infrastructure/logging/safeError.js';
import { NotificationOutbox } from '../../application/ports/notificationOutbox.port.js';
import { TRIAL_LIFECYCLE_WINDOW_MS } from '../../domain/policies/trialLifecycle.policy.js';
import { readTrialLifecycleNotification } from '../policies/prismaTrialLifecycle.policy.js';

const BATCH_SIZE = 100;

@Injectable()
export class TrialLifecycleWorker {
  private readonly logger = new Logger(TrialLifecycleWorker.name);

  constructor(
    @Inject(notificationConfig.KEY)
    private readonly config: ConfigType<typeof notificationConfig>,

    private readonly db: PrismaService,
    private readonly outbox: NotificationOutbox,
  ) {}

  @Cron('0 */5 * * * *', {
    name: 'trial-lifecycle',
    timeZone: 'UTC',
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    if (!this.config.workerEnabled || !this.config.trialLifecycleEnabled) {
      return;
    }

    try {
      await this.processTrials(new Date());
    } catch (error: unknown) {
      this.logger.error({
        message: 'Trial lifecycle processing failed',
        ...safeError(error),
      });
    }
  }

  private async processTrials(now: Date): Promise<void> {
    let cursor: string | undefined;

    while (true) {
      const trials = await this.findBatch(now, cursor);

      if (trials.length === 0) {
        return;
      }

      for (const trial of trials) {
        await this.processTrial(trial.id);
      }

      if (trials.length < BATCH_SIZE) {
        return;
      }

      cursor = trials[trials.length - 1].id;
    }
  }

  private findBatch(now: Date, cursor?: string) {
    const recentlyExpiredAt = new Date(now.getTime() - TRIAL_LIFECYCLE_WINDOW_MS);

    return this.db.organizationTrial.findMany({
      where: {
        id: cursor === undefined ? undefined : { gt: cursor },
        organizationId: {
          not: null,
        },
        convertedAt: null,
        revokedAt: null,
        startsAt: {
          lte: now,
        },
        expiresAt: {
          gt: recentlyExpiredAt,
        },
        owner: {
          disabledAt: null,
          emailVerifiedAt: {
            not: null,
          },
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        id: 'asc',
      },
      take: BATCH_SIZE,
    });
  }

  private async processTrial(trialId: string): Promise<void> {
    try {
      const notification = await readTransaction(this.db, (db) =>
        readTrialLifecycleNotification(db, trialId, new Date()),
      );

      if (notification === null) {
        return;
      }

      const existing = await this.db.notificationOutbox.findUnique({
        where: {
          key: notification.key,
        },
        select: {
          id: true,
        },
      });

      if (existing !== null) {
        return;
      }

      await this.outbox.enqueue(notification);
    } catch (error: unknown) {
      this.logger.error({
        message: 'Could not enqueue trial lifecycle notification',
        trialId,
        ...safeError(error),
      });
    }
  }
}
