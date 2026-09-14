import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { BillingGateway } from '../modules/billing/application/ports/billingGateway.port.js';
import { BillingLock } from '../modules/billing/application/ports/billingLock.port.js';
import { BillingRepository } from '../modules/billing/domain/repositories/billing.repository.js';

import { BillingCommandModule } from './billingCommand.module.js';

const logger = new Logger('BillingRecovery');

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(BillingCommandModule);

  try {
    const prisma = app.get(PrismaService);

    const [action = 'list', key, token, acknowledgement] = process.argv.slice(2);

    if (action === 'recover-customer' && key) {
      const repository = app.get(BillingRepository);
      const gateway = app.get(BillingGateway);

      await app.get(BillingLock).run(`organization:${key}`, async () => {
        const customer = await repository.customer(key);

        if (customer.stripeCustomerId !== null) {
          return;
        }

        const stripeCustomerId = await gateway.findCustomer(customer);

        if (stripeCustomerId === null) {
          throw new Error('No matching Stripe customer found; manual investigation is required');
        }

        await repository.setCustomerId(customer.id, stripeCustomerId);
      });

      logger.log({
        message: 'Billing customer recovered',
        organizationId: key,
      });

      return;
    }

    if (action === 'list') {
      const locks = await prisma.billingMutex.findMany({
        orderBy: {
          acquiredAt: 'asc',
        },
      });

      logger.log({
        message: 'Billing locks',
        locks,
      });

      const failedEvents = await prisma.stripeWebhookEvent.findMany({
        where: {
          failedAt: { not: null },
        },
        select: {
          id: true,
          lastErrorCode: true,
        },
        take: 100,
      });

      logger.log({
        message: 'Failed billing events (up to 100)',
        failedEvents,
      });

      return;
    }

    if (action === 'release' && key && token && acknowledgement === '--workers-stopped') {
      // Operator must stop every API, worker and command process first.
      // A time threshold alone cannot prove that a remote request finished.
      const result = await prisma.billingMutex.deleteMany({
        where: {
          key,
          token,
        },
      });

      if (result.count !== 1) {
        throw new Error('Lock not found or token changed');
      }

      logger.log({
        message: 'Billing lock released. Reconcile before restarting requests.',
        key,
      });

      return;
    }

    if (action === 'retry-event' && key) {
      const count = await prisma.$executeRaw`
        UPDATE "StripeWebhookEvent"
        SET
          "failedAt" = NULL,
          "attempts" = 0,
          "nextAttemptAt" = CURRENT_TIMESTAMP,
          "lastErrorCode" = NULL,
          "leaseToken" = NULL,
          "leaseExpiresAt" = NULL
        WHERE "id" = ${key}
          AND "processedAt" IS NULL
          AND (
            "leaseToken" IS NULL
            OR "leaseExpiresAt" <= CURRENT_TIMESTAMP
          )
      `;

      if (count !== 1) {
        throw new Error('Event not found, already processed, or currently leased by a worker');
      }

      logger.log({
        message: 'Billing event scheduled for retry',
        eventId: key,
      });

      return;
    }

    throw new Error(
      'Usage: list | release KEY TOKEN --workers-stopped | retry-event EVENT_ID | recover-customer ORGANIZATION_ID',
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : 'Billing recovery failed');

  process.exitCode = 1;
});
