import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const mercadoPagoWebhookConfig = registerAs('mercadoPagoWebhook', () => {
  const env = validateEnvironment(process.env);

  return {
    enabled: env.MERCADO_PAGO_WEBHOOK_ENABLED === true && env.MERCADO_PAGO_ENABLED && !env.MERCADO_PAGO_LIVE_MODE,
    clientId: env.MERCADO_PAGO_CLIENT_ID,
    secret: env.MERCADO_PAGO_WEBHOOK_SECRET,
  };
});
