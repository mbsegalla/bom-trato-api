import 'reflect-metadata';

import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { StartupLogger } from '../../infrastructure/logging/startupLogger.js';
import { SyncBillingUseCase } from '../../modules/billing/application/useCases/syncBilling.useCase.js';
import { BillingRepository } from '../../modules/billing/domain/repositories/billing.repository.js';
import { safeBillingError } from '../../modules/billing/infrastructure/logging/safeBillingError.js';

import { BillingCommandModule } from './billingCommand.module.js';

const logger = new ConsoleLogger('BillingReconciliation');

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(BillingCommandModule, {
    logger: new StartupLogger('BillingReconciliation'),
    abortOnError: false,
  });

  app.useLogger(new ConsoleLogger());

  try {
    const repository = app.get(BillingRepository);
    const syncBilling = app.get(SyncBillingUseCase);

    let cursor: string | undefined;
    let syncedCount = 0;
    let failedCount = 0;

    logger.log('Billing reconciliation started.');

    for (;;) {
      const customers = await repository.customerPage(cursor);

      if (customers.length === 0) {
        break;
      }

      for (const customer of customers) {
        try {
          await syncBilling.execute({
            organizationId: customer.organizationId,
            includeInvoiceHistory: true,
          });

          syncedCount += 1;
        } catch (error) {
          failedCount += 1;
          process.exitCode = 1;

          logger.error({
            message: 'Billing reconciliation failed',
            organizationId: customer.organizationId,
            ...safeBillingError(error),
          });
        }
      }

      cursor = customers.at(-1)?.id;
    }

    if (failedCount > 0) {
      logger.warn(`Billing reconciliation completed with failures. Synced: ${syncedCount}. Failed: ${failedCount}.`);
    } else {
      logger.log(`Billing reconciliation completed successfully. Synced: ${syncedCount}.`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: 'Billing reconciliation could not complete',
    ...safeBillingError(error),
  });

  process.exitCode = 1;
});
