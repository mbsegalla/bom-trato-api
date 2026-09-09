import type { FactoryProvider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Stripe from 'stripe';

import { stripeConfig } from '../../../../config/stripe.config.js';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export const stripeClientProvider: FactoryProvider<Stripe> = {
  provide: STRIPE_CLIENT,
  inject: [stripeConfig.KEY],
  useFactory: (config: ConfigType<typeof stripeConfig>): Stripe =>
    new Stripe(config.secretKey, {
      apiVersion: '2026-08-26.dahlia',
      maxNetworkRetries: 2,
      timeout: 10000,
    }),
};
