import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.repository.js';
import type { AuthTransaction } from '../../application/ports/authUnitOfWork.port.js';
import { AuthUnitOfWork } from '../../application/ports/authUnitOfWork.port.js';
import { PrismaAuthRepository } from '../repositories/prismaAuth.repository.js';

@Injectable()
export class PrismaAuthUnitOfWork extends AuthUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: PrismaNotificationOutbox,
  ) {
    super();
  }

  async run<T>(operation: (tx: AuthTransaction) => Promise<T>): Promise<T> {
    let notificationInserted = false;

    const result = await this.prisma.$transaction(
      (db) =>
        operation({
          auth: new PrismaAuthRepository(this.prisma, db),
          notifications: this.outbox.using(db, () => {
            notificationInserted = true;
          }),
        }),
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );

    if (notificationInserted) {
      this.outbox.notifyWorker();
    }

    return result;
  }
}
