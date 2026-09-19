import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { appConfig } from '../../../../config/app.config.js';
import { notificationConfig } from '../../../../config/notification.config.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { NotificationOutbox } from '../../application/ports/notificationOutbox.port.js';
import type { EnqueueNotification } from '../../application/types/notification.types.js';
import { NotificationCipher } from '../security/notificationCipher.js';
import { renderNotificationEmail } from '../templates/notificationEmail.renderer.js';

@Injectable()
export class PrismaNotificationOutbox extends NotificationOutbox {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: NotificationCipher,

    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,

    @Inject(notificationConfig.KEY)
    private readonly config: ConfigType<typeof notificationConfig>,
  ) {
    super();
  }

  using(db: Prisma.TransactionClient): NotificationOutbox {
    return {
      enqueue: (input) => this.insert(db, input),
    };
  }

  enqueue(input: EnqueueNotification): Promise<void> {
    return this.insert(this.prisma, input);
  }

  private async insert(db: Prisma.TransactionClient, input: EnqueueNotification): Promise<void> {
    const id = randomUUID();

    const message = renderNotificationEmail(input, this.app.frontendUrl, this.config.from);

    await db.notificationOutbox.createMany({
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
  }
}
