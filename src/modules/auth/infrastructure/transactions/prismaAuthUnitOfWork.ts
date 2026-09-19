import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.js';
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

  run<T>(operation: (tx: AuthTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      (db) =>
        operation({
          auth: new PrismaAuthRepository(this.prisma, db),
          notifications: this.outbox.using(db),
        }),
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }
}
