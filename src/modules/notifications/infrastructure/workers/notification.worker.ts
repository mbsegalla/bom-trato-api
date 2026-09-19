import { randomUUID } from 'node:crypto';

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';

import { notificationConfig } from '../../../../config/notification.config.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { NotificationJob, NotificationMessage } from '../../application/types/notification.types.js';
import { NotificationDeliveryError, ResendEmailGateway } from '../resend/resendEmail.gateway.js';
import { NotificationCipher } from '../security/notificationCipher.js';

@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);

  private running?: Promise<void>;
  private cleaning?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(notificationConfig.KEY)
    private readonly config: ConfigType<typeof notificationConfig>,

    private readonly db: PrismaService,
    private readonly cipher: NotificationCipher,
    private readonly sender: ResendEmailGateway,
  ) {}

  onModuleInit(): void {
    if (this.config.workerEnabled) {
      this.logger.log('Notification worker started; polling every 2 seconds');
    }
  }

  @Interval('notification-poll', 2000)
  async poll(): Promise<void> {
    if (!this.config.workerEnabled || this.stopping || this.running !== undefined) {
      return;
    }

    this.running = this.process()
      .catch(() => {
        this.logger.error('Notification polling failed; retrying on the next poll');
      })
      .finally(() => {
        this.running = undefined;
      });

    await this.running;
  }

  private async process(): Promise<void> {
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
      return;
    }

    const deadline = Math.min(
      job.expiresAt.getTime(),
      (job.firstAttemptAt?.getTime() ?? Date.now()) + 23 * 60 * 60 * 1000,
    );

    if (Date.now() >= deadline || job.attempts > 16) {
      await this.finish(job, 'SKIPPED', 'RETRY_WINDOW_EXPIRED');
      return;
    }

    let message: NotificationMessage;

    try {
      if (job.encryptedPayload === null) {
        throw new Error('MISSING_PAYLOAD');
      }

      message = this.cipher.decrypt(job.id, job.encryptedPayload);
    } catch {
      await this.finish(job, 'FAILED', 'INVALID_ENCRYPTED_PAYLOAD');
      return;
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
        return;
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

      return;
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
    if (!this.config.workerEnabled || this.stopping || this.cleaning !== undefined) {
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

    await Promise.all([this.running, this.cleaning]);
  }
}
