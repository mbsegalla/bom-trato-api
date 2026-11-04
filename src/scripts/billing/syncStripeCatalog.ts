import 'dotenv/config';

import { ConsoleLogger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import Stripe from 'stripe';

import { databaseConfig } from '../../config/database.config.js';
import { stripeConfig } from '../../config/stripe.config.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import { safeBillingError } from '../../modules/billing/infrastructure/logging/safeBillingError.js';
import { SyncStripeCatalogUseCase } from '../../modules/plans/application/useCases/syncStripeCatalog.useCase.js';
import { StripeCatalogSyncService } from '../../modules/plans/infrastructure/stripe/stripeCatalogSync.service.js';

const logger = new ConsoleLogger('StripeCatalogSync');

async function main(): Promise<void> {
  const database = databaseConfig();
  const configuration = stripeConfig();

  const stripe = new Stripe(configuration.secretKey, {
    apiVersion: '2026-08-26.dahlia',
    maxNetworkRetries: 2,
    timeout: 30000,
  });

  const adapter = new PrismaPg({
    connectionString: database.url,
    connectionTimeoutMillis: 5000,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();

    logger.log('Fetching Stripe catalog');

    const synchronizer = new StripeCatalogSyncService(stripe, prisma);
    const useCase = new SyncStripeCatalogUseCase(synchronizer);

    const result = await useCase.execute();

    if (result.plans === 0) {
      logger.warn('No products with plan_code metadata were found');
      return;
    }

    logger.log(`Catalog synchronized: ${result.plans} plans and ${result.prices} prices`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: 'Catalog synchronization failed',
    ...safeBillingError(error),
  });

  process.exitCode = 1;
});
