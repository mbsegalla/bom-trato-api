import Joi from 'joi';
import type Stripe from 'stripe';

import { BillingInterval } from '../../../../generated/prisma/enums.js';

interface PlanMetadata {
  plan_code: string;
  max_users: number;
  team_management_enabled: boolean;
  display_order: number;
  config_version: number;
}

const planMetadataSchema = Joi.object<PlanMetadata>({
  plan_code: Joi.string()
    .pattern(/^[A-Z][A-Z0-9_]*$/)
    .max(50)
    .required(),
  max_users: Joi.number().integer().min(1).max(2147483647).required(),
  team_management_enabled: Joi.boolean().required(),
  display_order: Joi.number().integer().min(0).max(2147483647).required(),
  config_version: Joi.number().integer().min(1).max(2147483647).required(),
});

export function parseStripeProduct(product: Stripe.Product) {
  const result = planMetadataSchema.validate(product.metadata, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
  });

  if (result.error !== undefined) {
    const fields = result.error.details.map((detail) => detail.path.join('.')).join(', ');

    throw new Error(`Invalid metadata for product ${product.id}. Check: ${fields}`);
  }

  if (product.name.length === 0 || product.name.length > 100) {
    throw new Error(`Product ${product.id} must have a name between 1 and 100 characters`);
  }

  const metadata = result.value;

  return {
    code: metadata.plan_code,
    name: product.name,
    description: product.description,
    stripeProductId: product.id,
    maxUsers: metadata.max_users,
    teamManagementEnabled: metadata.team_management_enabled,
    displayOrder: metadata.display_order,
    configVersion: metadata.config_version,
    stripeActive: product.active,
    stripeMetadata: { ...product.metadata },
  };
}

export function parseStripePrice(price: Stripe.Price) {
  const recurring = price.recurring;

  if (
    price.type !== 'recurring' ||
    recurring === null ||
    recurring.usage_type !== 'licensed' ||
    price.billing_scheme !== 'per_unit' ||
    price.transform_quantity !== null ||
    price.custom_unit_amount !== null
  ) {
    throw new Error(`Price ${price.id} must use fixed recurring pricing`);
  }

  if (price.currency !== 'brl') {
    throw new Error(`Price ${price.id} must use BRL`);
  }

  const amount = price.unit_amount;

  if (amount === null || !Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) {
    throw new Error(`Price ${price.id} must have a valid integer amount in cents`);
  }

  let interval: BillingInterval;

  switch (recurring.interval) {
    case 'month':
      interval = BillingInterval.MONTH;
      break;
    case 'year':
      interval = BillingInterval.YEAR;
      break;
    default:
      throw new Error(`Price ${price.id} must use a monthly or yearly interval`);
  }

  if (recurring.interval_count !== 1) {
    throw new Error(`Price ${price.id} must recur every month or every year`);
  }

  return {
    stripePriceId: price.id,
    lookupKey: price.lookup_key,
    amountInCents: amount,
    currency: price.currency,
    interval,
    intervalCount: recurring.interval_count,
    stripeActive: price.active,
    stripeMetadata: { ...price.metadata },
  };
}
