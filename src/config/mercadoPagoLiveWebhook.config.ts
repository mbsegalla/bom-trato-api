import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const mercadoPagoLiveWebhookConfig = registerAs('mercadoPagoLiveWebhook', () => {
  const env = validateEnvironment(process.env);
  const enabled =
    env.MERCADO_PAGO_LIVE_WEBHOOK_ENABLED === true && env.MERCADO_PAGO_ENABLED && env.MERCADO_PAGO_LIVE_MODE;

  return {
    enabled,
    workerEnabled: enabled && env.MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED === true,
    clientId: env.MERCADO_PAGO_CLIENT_ID,
    secret: env.MERCADO_PAGO_LIVE_WEBHOOK_SECRET,
  };
});
