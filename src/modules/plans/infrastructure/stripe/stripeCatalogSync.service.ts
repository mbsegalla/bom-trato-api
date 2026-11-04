import type Stripe from 'stripe';

import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { StripeCatalogSynchronizer } from '../../application/ports/stripeCatalogSynchronizer.port.js';
import type {
  StripeCatalogEntry,
  StripeCatalogSyncResult,
  StripeCatalogWebhookType,
} from '../../domain/types/stripeCatalog.types.js';

import { parseStripePrice, parseStripeProduct } from './stripeCatalog.parser.js';

function objectId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value !== null && 'id' in value) {
    return typeof value.id === 'string' ? value.id : null;
  }

  return null;
}

export class StripeCatalogSyncService extends StripeCatalogSynchronizer {
  constructor(
    private readonly stripe: Stripe,
    private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async syncAll(): Promise<StripeCatalogSyncResult> {
    const existingPlans = await this.prisma.plan.findMany({
      select: {
        stripeProductId: true,
      },
    });

    const existingProductIds = new Set(existingPlans.map((plan) => plan.stripeProductId));

    const catalog = await this.fetchCatalog(existingProductIds);

    if (catalog.length === 0) {
      return {
        plans: 0,
        prices: 0,
      };
    }

    await this.persistCatalog(catalog, true);

    return {
      plans: catalog.length,
      prices: catalog.reduce((total, entry) => total + entry.prices.length, 0),
    };
  }

  async syncWebhook(type: StripeCatalogWebhookType, stripeObjectId: string): Promise<void> {
    switch (type) {
      case 'product.deleted':
        await this.deactivateProduct(stripeObjectId);
        return;

      case 'price.deleted':
        await this.deactivatePrice(stripeObjectId);
        return;

      case 'product.created':
      case 'product.updated':
        await this.syncProduct(stripeObjectId);
        return;

      case 'price.created':
      case 'price.updated':
        await this.syncPrice(stripeObjectId);
    }
  }

  private async fetchCatalog(existingProductIds: Set<string>): Promise<StripeCatalogEntry[]> {
    const catalog: StripeCatalogEntry[] = [];
    const planCodes = new Set<string>();

    for await (const product of this.stripe.products.list({ limit: 100 })) {
      const planCode = product.metadata.plan_code;

      if (!planCode) {
        if (existingProductIds.has(product.id)) {
          throw new Error(`Previously imported product ${product.id} is missing plan_code`);
        }

        continue;
      }

      const entry = await this.createCatalogEntry(product);

      if (planCodes.has(entry.plan.code)) {
        throw new Error(`Duplicate plan_code found: ${entry.plan.code}`);
      }

      planCodes.add(entry.plan.code);

      catalog.push(entry);
    }

    return catalog;
  }

  private async syncProduct(stripeProductId: string): Promise<void> {
    const existing = await this.prisma.plan.findUnique({
      where: {
        stripeProductId,
      },
      select: {
        id: true,
      },
    });

    const product = await this.stripe.products.retrieve(stripeProductId);

    if ('deleted' in product) {
      await this.deactivateProduct(stripeProductId);
      return;
    }

    if (!product.metadata.plan_code) {
      if (existing !== null) {
        throw new Error(`Previously imported product ${stripeProductId} is missing plan_code`);
      }

      return;
    }

    const entry = await this.createCatalogEntry(product);

    await this.persistCatalog([entry], false);
  }

  private async syncPrice(stripePriceId: string): Promise<void> {
    const price = await this.stripe.prices.retrieve(stripePriceId);

    if ('deleted' in price) {
      await this.deactivatePrice(stripePriceId);
      return;
    }

    const stripeProductId = objectId(price.product);

    if (stripeProductId === null) {
      throw new Error(`Price ${stripePriceId} does not reference a valid Stripe product`);
    }

    await this.syncProduct(stripeProductId);
  }

  private async createCatalogEntry(product: Stripe.Product): Promise<StripeCatalogEntry> {
    const plan = parseStripeProduct(product);
    const prices: StripeCatalogEntry['prices'] = [];

    for await (const price of this.stripe.prices.list({
      product: product.id,
      limit: 100,
    })) {
      prices.push(parseStripePrice(price));
    }

    return {
      plan,
      prices,
    };
  }

  private async persistCatalog(catalog: StripeCatalogEntry[], fullCatalog: boolean): Promise<void> {
    const syncedAt = new Date();

    const stripeProductIds = catalog.map((entry) => entry.plan.stripeProductId);

    const lookupKeys = catalog
      .flatMap((entry) => entry.prices)
      .map((price) => price.lookupKey)
      .filter((lookupKey): lookupKey is string => lookupKey !== null);

    await this.prisma.$transaction(
      async (transaction) => {
        if (fullCatalog) {
          const stalePlans = await transaction.plan.findMany({
            where: {
              stripeProductId: {
                notIn: stripeProductIds,
              },
            },
            select: {
              id: true,
            },
          });

          if (stalePlans.length > 0) {
            const stalePlanIds = stalePlans.map((plan) => plan.id);

            await transaction.planPrice.updateMany({
              where: {
                planId: {
                  in: stalePlanIds,
                },
              },
              data: {
                stripeActive: false,
                lookupKey: null,
                lastSyncedAt: syncedAt,
              },
            });

            await transaction.plan.updateMany({
              where: {
                id: {
                  in: stalePlanIds,
                },
              },
              data: {
                stripeActive: false,
                lastSyncedAt: syncedAt,
              },
            });
          }
        }

        if (lookupKeys.length > 0) {
          await transaction.planPrice.updateMany({
            where: {
              lookupKey: {
                in: lookupKeys,
              },
            },
            data: {
              lookupKey: null,
            },
          });
        }

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

          const stripePriceIds = entry.prices.map((price) => price.stripePriceId);

          await transaction.planPrice.updateMany({
            where: {
              planId: plan.id,
              ...(stripePriceIds.length > 0
                ? {
                    stripePriceId: {
                      notIn: stripePriceIds,
                    },
                  }
                : {}),
            },
            data: {
              stripeActive: false,
              lookupKey: null,
              lastSyncedAt: syncedAt,
            },
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
  }

  private async deactivateProduct(stripeProductId: string): Promise<void> {
    const plan = await this.prisma.plan.findUnique({
      where: {
        stripeProductId,
      },
      select: {
        id: true,
      },
    });

    if (plan === null) {
      return;
    }

    const syncedAt = new Date();

    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.plan.update({
          where: {
            id: plan.id,
          },
          data: {
            stripeActive: false,
            lastSyncedAt: syncedAt,
          },
        });

        await transaction.planPrice.updateMany({
          where: {
            planId: plan.id,
          },
          data: {
            stripeActive: false,
            lookupKey: null,
            lastSyncedAt: syncedAt,
          },
        });
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  private async deactivatePrice(stripePriceId: string): Promise<void> {
    await this.prisma.planPrice.updateMany({
      where: {
        stripePriceId,
      },
      data: {
        stripeActive: false,
        lookupKey: null,
        lastSyncedAt: new Date(),
      },
    });
  }
}
