import 'dotenv/config';

import { ConsoleLogger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import Stripe from 'stripe';

import { databaseConfig } from '../../config/database.config.js';
import { stripeConfig } from '../../config/stripe.config.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import { safeBillingError } from '../../modules/billing/infrastructure/logging/safeBillingError.js';
import {
  parseStripePrice,
  parseStripeProduct,
} from '../../modules/plans/infrastructure/stripe/stripeCatalog.parser.js';

const logger = new ConsoleLogger('StripeCatalogSync');
interface CatalogEntry {
  plan: ReturnType<typeof parseStripeProduct>;
  prices: ReturnType<typeof parseStripePrice>[];
}

async function fetchCatalog(stripe: Stripe, existingProductIds: Set<string>): Promise<CatalogEntry[]> {
  const catalog: CatalogEntry[] = [];
  const planCodes = new Set<string>();

  for await (const product of stripe.products.list({ limit: 100 })) {
    const planCode = product.metadata.plan_code;

    if (!planCode) {
      if (existingProductIds.has(product.id)) {
        throw new Error(`Previously imported product ${product.id} is missing plan_code`);
      }

      continue;
    }

    const plan = parseStripeProduct(product);

    if (planCodes.has(plan.code)) {
      throw new Error(`Duplicate plan_code found: ${plan.code}`);
    }

    planCodes.add(plan.code);

    const prices: CatalogEntry['prices'] = [];

    for await (const price of stripe.prices.list({
      product: product.id,
      limit: 100,
    })) {
      prices.push(parseStripePrice(price));
    }

    catalog.push({ plan, prices });
  }

  return catalog;
}

async function main(): Promise<void> {
  const database = databaseConfig();
  const configuration = stripeConfig();

  const stripe = new Stripe(configuration.secretKey, {
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

    const existingPlans = await prisma.plan.findMany({
      select: {
        stripeProductId: true,
      },
    });

    const existingProductIds = new Set(existingPlans.map((plan) => plan.stripeProductId));

    logger.log('Fetching Stripe catalog');

    const catalog = await fetchCatalog(stripe, existingProductIds);

    if (catalog.length === 0) {
      logger.warn('No products with plan_code metadata were found');
      return;
    }

    const priceIds = catalog.flatMap((entry) => entry.prices.map((price) => price.stripePriceId));

    const syncedAt = new Date();

    await prisma.$transaction(
      async (transaction) => {
        // Lookup keys can move between prices in Stripe.
        await transaction.planPrice.updateMany({
          where: {
            stripePriceId: {
              in: priceIds,
            },
          },
          data: {
            lookupKey: null,
          },
        });

        for (const entry of catalog) {
          const planData = {
            ...entry.plan,
            lastSyncedAt: syncedAt,
          };

          const plan = await transaction.plan.upsert({
            where: {
              stripeProductId: entry.plan.stripeProductId,
            },
            create: {
              ...planData,
              published: false,
            },
            update: planData,
          });

          for (const price of entry.prices) {
            const priceData = {
              ...price,
              planId: plan.id,
              lastSyncedAt: syncedAt,
            };

            await transaction.planPrice.upsert({
              where: {
                stripePriceId: price.stripePriceId,
              },
              create: {
                ...priceData,
                published: false,
              },
              update: priceData,
            });
          }
        }
      },
      {
        maxWait: 5000,
        timeout: 30000,
      },
    );

    logger.log(`Catalog synchronized: ${catalog.length} plans and ${priceIds.length} prices`);
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
