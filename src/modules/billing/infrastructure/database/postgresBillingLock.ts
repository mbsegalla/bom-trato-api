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
        try {
          await this.release(key, token);
        } catch (releaseError: unknown) {
          this.logFailure('Billing operation failed and its mutex could not be released', key, token, error);

          throw releaseError;
        }
      } else {
        this.logFailure('Billing operation requires recovery', key, token, error);

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
          key,
          token,
        });
      }
    } catch (error: unknown) {
      this.logFailure('Failed to mark billing mutex for recovery', key, token, error);
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
        key,
        token,
      });
    } catch (error: unknown) {
      this.logFailure('Failed to release billing mutex; reconciliation is required', key, token, error);
    }

    throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
  }

  private logFailure(message: string, key: string, token: string, error: unknown): void {
    const rawCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

    const code =
      typeof rawCode === 'string' && /^(P[0-9]{4}|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(rawCode)
        ? rawCode
        : undefined;

    this.logger.error({
      message,
      key,
      token,
      code,
      billingCode: error instanceof BillingError ? error.code : undefined,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}
