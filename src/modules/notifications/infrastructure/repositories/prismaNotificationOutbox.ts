import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { appConfig } from '../../../../config/app.config.js';
import { notificationConfig } from '../../../../config/notification.config.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { NotificationOutbox } from '../../application/ports/notificationOutbox.port.js';
import type { EnqueueNotification } from '../../application/types/notification.types.js';
import { NOTIFICATIONS_AVAILABLE_EVENT } from '../events/notification.events.js';
import { NotificationCipher } from '../security/notificationCipher.js';
import { renderNotificationEmail } from '../templates/notificationEmail.renderer.js';

@Injectable()
export class PrismaNotificationOutbox extends NotificationOutbox {
  private readonly logger = new Logger(PrismaNotificationOutbox.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: NotificationCipher,
    private readonly eventEmitter: EventEmitter2,

    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,

    @Inject(notificationConfig.KEY)
    private readonly config: ConfigType<typeof notificationConfig>,
  ) {
    super();
  }

  using(db: Prisma.TransactionClient, onInserted: () => void): NotificationOutbox {
    return {
      enqueue: async (input): Promise<void> => {
        const inserted = await this.insert(db, input);

        if (inserted) {
          onInserted();
        }
      },
    };
  }

  async enqueue(input: EnqueueNotification): Promise<void> {
    const inserted = await this.insert(this.prisma, input);

    if (inserted) {
      this.notifyWorker();
    }
  }

  notifyWorker(): void {
    try {
      this.eventEmitter.emit(NOTIFICATIONS_AVAILABLE_EVENT);
    } catch {
      // The transaction has already committed.
      // Recovery can process the persisted notification.
      this.logger.error('Could not notify the notification worker; periodic recovery remains available');
    }
  }

  private async insert(db: Prisma.TransactionClient, input: EnqueueNotification): Promise<boolean> {
    const id = randomUUID();

    const message = renderNotificationEmail(input, this.app.frontendUrl, this.config.from);

    const result = await db.notificationOutbox.createMany({
      data: [
        {
          id,
          key: input.key,
          type: input.content.type,
          expiresAt: input.expiresAt,
          encryptedPayload: this.cipher.encrypt(id, message),
        },
      ],
      skipDuplicates: true,
    });

    return result.count > 0;
  }
}
