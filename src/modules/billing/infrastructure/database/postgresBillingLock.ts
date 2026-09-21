import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { BillingLock } from '../../application/ports/billingLock.port.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import { safeBillingError } from '../logging/safeBillingError.js';

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
        try {
          await this.release(key, token);
        } catch (releaseError: unknown) {
          this.logFailure('Billing operation failed and its mutex could not be released', releaseError, key);

          throw releaseError;
        }
      } else {
        this.logFailure('Billing operation requires recovery', error, key);

        await this.markRecoveryRequired(key, token);
      }

      throw error;
    }

    await this.release(key, token);

    return result;
  }

  private async markRecoveryRequired(key: string, token: string): Promise<void> {
    try {
      const result = await this.prisma.billingMutex.updateMany({
        where: { key, token },
        data: { recoveryRequired: true },
      });

      if (result.count !== 1) {
        this.logger.error({
          message: 'Billing mutex was not found while marking recovery',
          organizationId: this.organizationIdFromKey(key),
        });
      }
    } catch (error: unknown) {
      this.logFailure('Failed to mark billing mutex for recovery', error, key);
    }
  }

  private async release(key: string, token: string): Promise<void> {
    try {
      const result = await this.prisma.billingMutex.deleteMany({
        where: { key, token },
      });

      if (result.count === 1) {
        return;
      }

      this.logger.error({
        message: 'Billing mutex was not found during release; reconciliation is required',
        organizationId: this.organizationIdFromKey(key),
      });
    } catch (error: unknown) {
      this.logFailure('Failed to release billing mutex; reconciliation is required', error, key);
    }

    throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
  }

  private logFailure(message: string, error: unknown, key: string): void {
    this.logger.error({
      message,
      organizationId: this.organizationIdFromKey(key),
      ...safeBillingError(error),
    });
  }

  private organizationIdFromKey(key: string): string | undefined {
    return /^organization:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(key)?.[1];
  }
}
