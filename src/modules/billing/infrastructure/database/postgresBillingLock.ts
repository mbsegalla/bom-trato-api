import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { BillingLock } from '../../application/ports/billingLock.port.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import { safeBillingError } from '../logging/safeBillingError.js';

const LEASE_DURATION_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 10_000;

const ACQUIRE_RETRY_DELAYS_MS = [0, 200, 400, 700, 1200] as const;

interface BillingHeartbeat {
  stop(): Promise<boolean>;
}

@Injectable()
export class PostgresBillingLock extends BillingLock {
  private readonly logger = new Logger(PostgresBillingLock.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const token = randomUUID();

    await this.acquire(key, token);

    const heartbeat = this.startHeartbeat(key, token);

    let result: T | undefined;

    let failed = false;
    let failure: unknown;

    try {
      result = await operation();
    } catch (error: unknown) {
      failed = true;
      failure = error;
    }

    const leaseLost = await heartbeat.stop();

    if (leaseLost) {
      this.logger.error({
        message: 'Billing mutex lease was lost; reconciliation is required',
        organizationId: this.organizationIdFromKey(key),
      });

      throw new BillingError('BILLING_RECONCILIATION_REQUIRED', {
        cause: failure,
      });
    }

    if (failed) {
      if (failure instanceof BillingError) {
        await this.release(key, token);
      } else {
        this.logFailure('Billing operation requires recovery', failure, key);

        await this.markRecoveryRequired(key, token);
      }

      throw failure;
    }

    await this.release(key, token);

    return result as T;
  }

  private async acquire(key: string, token: string): Promise<void> {
    try {
      for (const delay of ACQUIRE_RETRY_DELAYS_MS) {
        if (delay > 0) {
          await this.sleep(delay);
        }

        if (await this.tryAcquire(key, token)) {
          return;
        }
      }
    } catch (error: unknown) {
      if (error instanceof BillingError) {
        throw error;
      }

      this.logFailure('Failed to acquire billing mutex', error, key);

      throw new BillingError('BILLING_WRITE_FAILED', {
        cause: error,
      });
    }

    throw new BillingError('BILLING_BUSY');
  }

  private async tryAcquire(key: string, token: string): Promise<boolean> {
    const now = new Date();

    const leaseUntil = new Date(now.getTime() + LEASE_DURATION_MS);

    const acquired = await this.prisma.billingMutex.createMany({
      data: [
        {
          key,
          token,
          acquiredAt: now,
          leaseUntil,
        },
      ],
      skipDuplicates: true,
    });

    if (acquired.count === 1) {
      return true;
    }

    const existing = await this.prisma.billingMutex.findUnique({
      where: {
        key,
      },
      select: {
        token: true,
        acquiredAt: true,
        leaseUntil: true,
        recoveryRequired: true,
      },
    });

    if (existing === null) {
      return false;
    }

    if (existing.recoveryRequired) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    if (existing.leaseUntil > now) {
      return false;
    }

    const reclaimed = await this.prisma.billingMutex.updateMany({
      where: {
        key,
        token: existing.token,
        recoveryRequired: false,
        leaseUntil: {
          lte: now,
        },
      },
      data: {
        token,
        acquiredAt: now,
        leaseUntil,
      },
    });

    if (reclaimed.count !== 1) {
      return false;
    }

    this.logger.warn({
      message: 'Expired billing mutex lease was reclaimed',
      organizationId: this.organizationIdFromKey(key),
      previousAcquiredAt: existing.acquiredAt,
      previousLeaseUntil: existing.leaseUntil,
    });

    return true;
  }

  private startHeartbeat(key: string, token: string): BillingHeartbeat {
    let leaseLost = false;

    let renewal: Promise<void> | undefined;

    const heartbeat = setInterval(() => {
      if (renewal !== undefined || leaseLost) {
        return;
      }

      renewal = this.renew(key, token)
        .then((owned) => {
          if (!owned) {
            leaseLost = true;
          }
        })
        .catch((error: unknown) => {
          leaseLost = true;

          this.logFailure('Billing mutex lease renewal failed', error, key);
        })
        .finally(() => {
          renewal = undefined;
        });
    }, HEARTBEAT_INTERVAL_MS);

    heartbeat.unref();

    return {
      stop: async () => {
        clearInterval(heartbeat);

        await renewal;

        return leaseLost;
      },
    };
  }

  private async renew(key: string, token: string): Promise<boolean> {
    const result = await this.prisma.billingMutex.updateMany({
      where: {
        key,
        token,
        recoveryRequired: false,
      },
      data: {
        leaseUntil: new Date(Date.now() + LEASE_DURATION_MS),
      },
    });

    return result.count === 1;
  }

  private async markRecoveryRequired(key: string, token: string): Promise<void> {
    try {
      const result = await this.prisma.billingMutex.updateMany({
        where: {
          key,
          token,
        },
        data: {
          recoveryRequired: true,
        },
      });

      if (result.count === 1) {
        return;
      }

      this.logger.error({
        message: 'Billing mutex was not found while marking recovery',
        organizationId: this.organizationIdFromKey(key),
      });
    } catch (error: unknown) {
      this.logFailure('Failed to mark billing mutex for recovery', error, key);

      throw new BillingError('BILLING_RECONCILIATION_REQUIRED', {
        cause: error,
      });
    }

    throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
  }

  private async release(key: string, token: string): Promise<void> {
    try {
      const result = await this.prisma.billingMutex.deleteMany({
        where: {
          key,
          token,
        },
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

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, milliseconds);

      timeout.unref();
    });
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
