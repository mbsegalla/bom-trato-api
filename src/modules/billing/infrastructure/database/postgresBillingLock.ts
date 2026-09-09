import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { BillingLock } from '../../application/ports/billingLock.port.js';
import { BillingError } from '../../domain/errors/billing.error.js';

@Injectable()
export class PostgresBillingLock extends BillingLock {
  private readonly logger = new Logger(PostgresBillingLock.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const token = randomUUID();

    const acquired = await this.prisma.billingMutex.createMany({
      data: [{ key, token }],
      skipDuplicates: true,
    });

    if (acquired.count !== 1) {
      throw new BillingError('BILLING_BUSY');
    }

    let result: T;

    try {
      result = await operation();
    } catch (error: unknown) {
      if (error instanceof BillingError) {
        await this.release(key, token);
      } else {
        this.logger.error({
          message: 'Billing operation requires recovery',
          key,
          token,
        });

        await this.prisma.billingMutex
          .updateMany({
            where: { key, token },
            data: { recoveryRequired: true },
          })
          .catch(() => undefined);
      }

      throw error;
    }

    await this.release(key, token);

    return result;
  }

  private async release(key: string, token: string): Promise<void> {
    try {
      const result = await this.prisma.billingMutex.deleteMany({
        where: { key, token },
      });

      if (result.count === 1) {
        return;
      }
    } catch {
      console.error('Failed to release billing mutex', { key, token });
    }

    this.logger.error({
      message: 'Billing mutex release requires recovery',
      key,
      token,
    });

    throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
  }
}
