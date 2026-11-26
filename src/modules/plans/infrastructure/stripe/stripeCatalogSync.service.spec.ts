import { describe, expect, it, vi } from 'vitest';

import type Stripe from 'stripe';

import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { StripeCatalogSyncService } from './stripeCatalogSync.service.js';

const product = {
  id: 'prod_fixture', name: 'Fixture plan', description: null, active: true,
  metadata: {
    plan_code: 'PRO', max_users: '5', team_management_enabled: 'true',
    display_order: '2', config_version: '3', change_level: '2',
  },
};
const price = {
  id: 'price_fixture', product: product.id, type: 'recurring', currency: 'brl',
  unit_amount: 1299, billing_scheme: 'per_unit',
  recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
  transform_quantity: null, custom_unit_amount: null, lookup_key: 'fixture',
  active: true, metadata: {},
};

function fixture() {
  const products = { list: vi.fn().mockReturnValue([product]), retrieve: vi.fn().mockResolvedValue(product) };
  const prices = { list: vi.fn().mockReturnValue([price]), retrieve: vi.fn().mockResolvedValue(price) };
  const plan = {
    findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    upsert: vi.fn().mockResolvedValue({ id: 'local-plan' }),
  };
  const planPrice = {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }), upsert: vi.fn().mockResolvedValue(undefined),
  };
  const db = { plan, planPrice };
  const transaction = vi.fn(async (callback: (client: typeof db) => Promise<void>) => callback(db));
  const service = new StripeCatalogSyncService(
    { products, prices } as unknown as Stripe,
    { ...db, $transaction: transaction } as unknown as PrismaClient,
  );

  return { service, products, prices, plan, planPrice, transaction };
}

describe('StripeCatalogSyncService', () => {
  it('does not deactivate existing plans when the remote catalog is empty', async () => {
    const f = fixture();
    f.products.list.mockReturnValue([]);
    expect(await f.service.syncAll()).toEqual({ plans: 0, prices: 0 });
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('ignores unrelated products that have never been imported', async () => {
    const f = fixture();
    f.products.list.mockReturnValue([{ ...product, metadata: {} }]);
    expect(await f.service.syncAll()).toEqual({ plans: 0, prices: 0 });
    expect(f.prices.list).not.toHaveBeenCalled();
  });

  it('refuses a previously imported product that lost its plan code', async () => {
    const f = fixture();
    f.plan.findMany.mockResolvedValue([{ stripeProductId: product.id }]);
    f.products.list.mockReturnValue([{ ...product, metadata: {} }]);
    await expect(f.service.syncAll()).rejects.toThrow('missing plan_code');
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate plan codes before persisting the catalog', async () => {
    const f = fixture();
    f.products.list.mockReturnValue([product, { ...product, id: 'prod_other' }]);
    await expect(f.service.syncAll()).rejects.toThrow('Duplicate plan_code found: PRO');
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('imports unpublished defaults while preserving publication state on updates', async () => {
    const f = fixture();

    expect(await f.service.syncAll()).toEqual({ plans: 1, prices: 1 });
    expect(f.plan.upsert).toHaveBeenCalledWith({
      where: { stripeProductId: product.id },
      create: expect.objectContaining({ published: false, code: 'PRO', maxUsers: 5 }),
      update: expect.not.objectContaining({ published: expect.anything() }),
    });
    expect(f.planPrice.upsert).toHaveBeenCalledWith({
      where: { stripePriceId: price.id },
      create: expect.objectContaining({ published: false, planId: 'local-plan', amountInCents: 1299 }),
      update: expect.not.objectContaining({ published: expect.anything() }),
    });
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5000, timeout: 30000 });
  });

  it('deactivates stale plans and prices only during a full synchronization', async () => {
    const f = fixture();
    f.plan.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'stale-plan' }]);

    await f.service.syncAll();

    expect(f.plan.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['stale-plan'] } },
      data: { stripeActive: false, lastSyncedAt: expect.any(Date) },
    });
    expect(f.planPrice.updateMany).toHaveBeenCalledWith({
      where: { planId: { in: ['stale-plan'] } },
      data: { stripeActive: false, lookupKey: null, lastSyncedAt: expect.any(Date) },
    });
  });

  it('clears conflicting lookup keys and disables removed prices for the imported plan', async () => {
    const f = fixture();
    await f.service.syncAll();

    expect(f.planPrice.updateMany).toHaveBeenCalledWith({
      where: { lookupKey: { in: [price.lookup_key] } }, data: { lookupKey: null },
    });
    expect(f.planPrice.updateMany).toHaveBeenCalledWith({
      where: { planId: 'local-plan', stripePriceId: { notIn: [price.id] } },
      data: { stripeActive: false, lookupKey: null, lastSyncedAt: expect.any(Date) },
    });
  });

  it('disables all existing prices when the remote plan has no prices', async () => {
    const f = fixture();
    f.prices.list.mockReturnValue([]);
    expect(await f.service.syncAll()).toEqual({ plans: 1, prices: 0 });
    expect(f.planPrice.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { planId: 'local-plan' },
      data: { stripeActive: false, lookupKey: null, lastSyncedAt: expect.any(Date) },
    });
    expect(f.planPrice.upsert).not.toHaveBeenCalled();
  });

  it.each(['product.created', 'product.updated'] as const)('synchronizes only the product for %s', async (type) => {
    const f = fixture();
    await f.service.syncWebhook(type, product.id);
    expect(f.products.retrieve).toHaveBeenCalledWith(product.id);
    expect(f.plan.findMany).not.toHaveBeenCalled();
    expect(f.plan.updateMany).not.toHaveBeenCalled();
    expect(f.plan.upsert).toHaveBeenCalledTimes(1);
  });

  it.each(['price.created', 'price.updated'] as const)('resolves expanded product identity for %s', async (type) => {
    const f = fixture();
    f.prices.retrieve.mockResolvedValue({ ...price, product: { id: product.id } });
    await f.service.syncWebhook(type, price.id);
    expect(f.prices.retrieve).toHaveBeenCalledWith(price.id);
    expect(f.products.retrieve).toHaveBeenCalledWith(product.id);
  });

  it('rejects prices with invalid product identity', async () => {
    const f = fixture();
    f.prices.retrieve.mockResolvedValue({ ...price, product: null });
    await expect(f.service.syncWebhook('price.updated', price.id)).rejects.toThrow('does not reference a valid Stripe product');
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('deactivates an explicitly deleted price without fetching it remotely', async () => {
    const f = fixture();
    await f.service.syncWebhook('price.deleted', price.id);
    expect(f.prices.retrieve).not.toHaveBeenCalled();
    expect(f.planPrice.updateMany).toHaveBeenCalledWith({
      where: { stripePriceId: price.id },
      data: { stripeActive: false, lookupKey: null, lastSyncedAt: expect.any(Date) },
    });
  });

  it('deactivates a price returned as deleted by the provider', async () => {
    const f = fixture();
    f.prices.retrieve.mockResolvedValue({ id: price.id, deleted: true });
    await f.service.syncWebhook('price.updated', price.id);
    expect(f.planPrice.updateMany).toHaveBeenCalledTimes(1);
    expect(f.products.retrieve).not.toHaveBeenCalled();
  });

  it('deactivates a known deleted product and all its prices atomically', async () => {
    const f = fixture();
    f.plan.findUnique.mockResolvedValue({ id: 'local-plan' });
    await f.service.syncWebhook('product.deleted', product.id);
    expect(f.plan.update).toHaveBeenCalledWith({
      where: { id: 'local-plan' },
      data: { stripeActive: false, lastSyncedAt: expect.any(Date) },
    });
    expect(f.planPrice.updateMany).toHaveBeenCalledWith({
      where: { planId: 'local-plan' },
      data: { stripeActive: false, lookupKey: null, lastSyncedAt: expect.any(Date) },
    });
  });

  it('ignores deletion of an unknown product', async () => {
    const f = fixture();
    await f.service.syncWebhook('product.deleted', product.id);
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('rejects removal of the plan code from a known product on webhook', async () => {
    const f = fixture();
    f.plan.findUnique.mockResolvedValue({ id: 'local-plan' });
    f.products.retrieve.mockResolvedValue({ ...product, metadata: {} });
    await expect(f.service.syncWebhook('product.updated', product.id)).rejects.toThrow('missing plan_code');
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('does not persist invalid remote pricing', async () => {
    const f = fixture();
    f.prices.list.mockReturnValue([{ ...price, currency: 'usd' }]);
    await expect(f.service.syncAll()).rejects.toThrow('must use BRL');
    expect(f.transaction).not.toHaveBeenCalled();
  });
});
