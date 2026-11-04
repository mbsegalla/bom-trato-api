import type { BillingInterval } from '../../../../generated/prisma/enums.js';

export const stripeCatalogWebhookTypes = [
  'product.created',
  'product.updated',
  'product.deleted',
  'price.created',
  'price.updated',
  'price.deleted',
] as const;

export type StripeCatalogWebhookType = (typeof stripeCatalogWebhookTypes)[number];

export interface StripeCatalogPlan {
  code: string;
  name: string;
  description: string | null;
  stripeProductId: string;
  maxUsers: number;
  teamManagementEnabled: boolean;
  displayOrder: number;
  configVersion: number;
  changeLevel: number;
  stripeActive: boolean;
  stripeMetadata: Record<string, string>;
}

export interface StripeCatalogPrice {
  stripePriceId: string;
  lookupKey: string | null;
  amountInCents: number;
  currency: string;
  interval: BillingInterval;
  intervalCount: number;
  stripeActive: boolean;
  stripeMetadata: Record<string, string>;
}

export interface StripeCatalogEntry {
  plan: StripeCatalogPlan;
  prices: StripeCatalogPrice[];
}

export interface StripeCatalogSyncResult {
  plans: number;
  prices: number;
}

export function isStripeCatalogWebhookType(value: string): value is StripeCatalogWebhookType {
  return stripeCatalogWebhookTypes.some((type) => type === value);
}
