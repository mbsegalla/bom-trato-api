import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import { parseStripePrice, parseStripeProduct } from './stripeCatalog.parser.js';

const product = {
  id: 'prod_fixture',
  name: 'Fixture plan',
  description: null,
  active: true,
  metadata: {
    plan_code: 'PRO',
    max_users: '5',
    team_management_enabled: 'true',
    display_order: '2',
    config_version: '3',
    change_level: '2',
    extra: 'fixture',
  },
};
const price = {
  id: 'price_fixture',
  type: 'recurring',
  currency: 'brl',
  unit_amount: 1299,
  billing_scheme: 'per_unit',
  recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
  transform_quantity: null,
  custom_unit_amount: null,
  lookup_key: 'fixture',
  active: true,
  metadata: {},
};
const parseProduct = (value: unknown) => parseStripeProduct(value as Stripe.Product);
const parsePrice = (value: unknown) => parseStripePrice(value as Stripe.Price);

describe('Stripe catalog parser', () => {
  it('converts metadata strings to typed plan configuration without changing the original metadata', () => {
    expect(parseProduct(product)).toMatchObject({
      code: 'PRO',
      maxUsers: 5,
      teamManagementEnabled: true,
      displayOrder: 2,
      configVersion: 3,
      changeLevel: 2,
      stripeMetadata: product.metadata,
    });
    expect(product.metadata.max_users).toBe('5');
  });

  it('rejects malformed metadata and invalid product names', () => {
    expect(() =>
      parseProduct({ ...product, metadata: { ...product.metadata, plan_code: 'lowercase', max_users: '0' } }),
    ).toThrow(/plan_code.*max_users/);
    expect(() => parseProduct({ ...product, name: '' })).toThrow(/name between/);
  });

  it('maps monthly and yearly integer amounts without converting cents to reais', () => {
    expect(parsePrice(price)).toMatchObject({
      amountInCents: 1299,
      currency: 'brl',
      interval: 'MONTH',
      intervalCount: 1,
    });
    expect(parsePrice({ ...price, recurring: { ...price.recurring, interval: 'year' } })).toMatchObject({
      interval: 'YEAR',
      intervalCount: 1,
    });
  });

  it.each([
    [{ type: 'one_time' }, /fixed recurring/],
    [{ recurring: null }, /fixed recurring/],
    [{ currency: 'usd' }, /BRL/],
    [{ unit_amount: 1.5 }, /integer amount/],
    [{ unit_amount: 2147483648 }, /integer amount/],
    [{ recurring: { ...price.recurring, interval: 'week' } }, /monthly or yearly/],
    [{ recurring: { ...price.recurring, interval_count: 2 } }, /every month or every year/],
  ] as const)('rejects incompatible remote prices: %j', (fields, message) => {
    expect(() => parsePrice({ ...price, ...fields })).toThrow(message);
  });
});
