import { randomUUID } from 'node:crypto';

import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';

import { notificationConfig } from '../../../../config/notification.config.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { NotificationJob, NotificationMessage } from '../../application/types/notification.types.js';
import { NOTIFICATIONS_AVAILABLE_EVENT } from '../events/notification.events.js';
import { NotificationDeliveryError, ResendEmailGateway } from '../resend/resendEmail.gateway.js';
import { NotificationCipher } from '../security/notificationCipher.js';

@Injectable()
export class NotificationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);

  private running?: Promise<void>;
  private cleaning?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;

  private started = false;
  private stopping = false;
  private wakeRequested = false;

  constructor(
    @Inject(notificationConfig.KEY)
    private readonly config: ConfigType<typeof notificationConfig>,

    private readonly db: PrismaService,
    private readonly cipher: NotificationCipher,
    private readonly sender: ResendEmailGateway,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.workerEnabled) {
      return;
    }

    this.started = true;

    this.logger.log('Notification worker started; event-driven processing with recovery every 60 seconds');

    // Startup recovery does not depend on an event listener being ready.
    this.wake();
  }

  @OnEvent(NOTIFICATIONS_AVAILABLE_EVENT, {
    suppressErrors: true,
  })
  handleNotificationsAvailable(): void {
    this.wake();
  }

  @Interval('notification-recovery', 60_000)
  recover(): void {
    this.wake();
  }

  private wake(): void {
    if (!this.config.workerEnabled || !this.started || this.stopping) {
      return;
    }

    this.wakeRequested = true;

    if (this.running !== undefined || this.timer !== undefined) {
      return;
    }

    this.startProcessing();
  }

  private startProcessing(): void {
    if (!this.config.workerEnabled || !this.started || this.stopping || this.running !== undefined) {
      return;
    }

    this.wakeRequested = false;

    let foundJob = false;
    let failed = false;

    this.running = this.process()
      .then((processed) => {
        foundJob = processed;
      })
      .catch(() => {
        failed = true;

        this.logger.error('Notification processing failed; pending jobs remain available for recovery');
      })
      .finally(() => {
        this.running = undefined;

        if (this.stopping || failed) {
          return;
        }

        if (foundJob || this.wakeRequested) {
          this.scheduleNext();
        }
      });
  }

  private scheduleNext(): void {
    if (this.stopping || this.timer !== undefined) {
      return;
    }

    // Pace processing while work is available.
    // Scheduling stops after a query finds no available job.
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.startProcessing();
    }, 2000);
  }

  private async process(): Promise<boolean> {
    const token = randomUUID();

    const jobs = await this.db.$queryRaw<NotificationJob[]>`
      WITH candidate AS (
        SELECT "id"
        FROM "NotificationOutbox"
        WHERE (
          "status" = 'PENDING'
          AND "availableAt" <= CURRENT_TIMESTAMP
        )
        OR (
          "status" = 'PROCESSING'
          AND "leaseUntil" <= CURRENT_TIMESTAMP
        )
        ORDER BY "availableAt", "createdAt", "id"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "NotificationOutbox" job
      SET
        "status" = 'PROCESSING',
        "leaseToken" = ${token}::uuid,
        "leaseUntil" = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
        "firstAttemptAt" = COALESCE(
          job."firstAttemptAt",
          CURRENT_TIMESTAMP
        ),
        "attempts" = job."attempts" + 1
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job.*
    `;

    const job = jobs[0];

    if (job === undefined) {
      return false;
    }

    const deadline = Math.min(
      job.expiresAt.getTime(),
      (job.firstAttemptAt?.getTime() ?? Date.now()) + 23 * 60 * 60 * 1000,
    );

    if (Date.now() >= deadline || job.attempts > 16) {
      await this.finish(job, 'SKIPPED', 'RETRY_WINDOW_EXPIRED');

      return true;
    }

    let message: NotificationMessage;

    try {
      if (job.encryptedPayload === null) {
        throw new Error('MISSING_PAYLOAD');
      }

      message = this.cipher.decrypt(job.id, job.encryptedPayload);
    } catch {
      await this.finish(job, 'FAILED', 'INVALID_ENCRYPTED_PAYLOAD');

      return true;
    }

    let providerId: string;

    try {
      providerId = await this.sender.send(job.id, message);
    } catch (error: unknown) {
      const retryable = !(error instanceof NotificationDeliveryError) || error.retryable;

      const code = error instanceof NotificationDeliveryError ? error.code : 'PROVIDER_UNAVAILABLE';

      const delay = Math.max(
        Math.min(3600, 30 * 2 ** (job.attempts - 1)),
        error instanceof NotificationDeliveryError ? error.retryAfterSeconds : 0,
      );

      const availableAt = new Date(Date.now() + delay * 1000);

      if (!retryable || job.attempts >= 16 || availableAt.getTime() >= deadline) {
        await this.finish(job, 'FAILED', code);

        return true;
      }

      await this.db.notificationOutbox.updateMany({
        where: {
          id: job.id,
          status: 'PROCESSING',
          leaseToken: job.leaseToken,
        },
        data: {
          status: 'PENDING',
          availableAt,
          leaseToken: null,
          leaseUntil: null,
          lastErrorCode: code,
        },
      });

      this.logger.warn({
        message: 'Notification retry scheduled',
        notificationId: job.id,
        code,
      });

      return true;
    }

    // A persistence failure leaves the job recoverable with the same
    // idempotency key and the same request body.
    const result = await this.db.notificationOutbox.updateMany({
      where: {
        id: job.id,
        status: 'PROCESSING',
        leaseToken: job.leaseToken,
      },
      data: {
        status: 'ACCEPTED',
        providerId,
        encryptedPayload: null,
        finishedAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: null,
      },
    });

    if (result.count !== 1) {
      this.logger.warn({
        message: 'Notification lease lost after provider acceptance',
        notificationId: job.id,
      });
    }

    return true;
  }

  private async finish(job: NotificationJob, status: 'FAILED' | 'SKIPPED', code: string): Promise<void> {
    const result = await this.db.notificationOutbox.updateMany({
      where: {
        id: job.id,
        status: 'PROCESSING',
        leaseToken: job.leaseToken,
      },
      data: {
        status,
        lastErrorCode: code,
        encryptedPayload: null,
        finishedAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
      },
    });

    if (result.count === 1) {
      this.logger.warn({
        message: 'Notification finished without delivery',
        notificationId: job.id,
        status,
        code,
      });
    }
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'notification-cleanup',
    timeZone: 'UTC',
    waitForCompletion: true,
  })
  async cleanup(): Promise<void> {
    if (!this.config.workerEnabled || !this.started || this.stopping || this.cleaning !== undefined) {
      return;
    }

    this.cleaning = this.db.$executeRaw`
      WITH candidates AS (
        SELECT "id"
        FROM "NotificationOutbox"
        WHERE "finishedAt" < CURRENT_TIMESTAMP - INTERVAL '30 days'
        ORDER BY "finishedAt", "id"
        LIMIT 1000
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "NotificationOutbox" job
      USING candidates
      WHERE job."id" = candidates."id"
    `
      .then(() => undefined)
      .catch(() => {
        this.logger.error('Notification cleanup failed');
      })
      .finally(() => {
        this.cleaning = undefined;
      });

    await this.cleaning;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    await Promise.all([this.running, this.cleaning]);
  }
}
