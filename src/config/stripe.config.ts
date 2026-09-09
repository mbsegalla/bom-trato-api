import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const stripeConfig = registerAs('stripe', () => {
  const env = validateEnvironment(process.env);

  return {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID,
    workerEnabled: env.BILLING_WORKER_ENABLED,
  };
});
