import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const mercadoPagoConfig = registerAs('mercadoPago', () => {
  const env = validateEnvironment(process.env);

  return {
    enabled: env.MERCADO_PAGO_ENABLED,
    liveMode: env.MERCADO_PAGO_LIVE_MODE,
    sandboxPixEnabled: env.MERCADO_PAGO_SANDBOX_PIX_ENABLED,
    clientId: env.MERCADO_PAGO_CLIENT_ID,
    clientSecret: env.MERCADO_PAGO_CLIENT_SECRET,
    encryptionKey: env.MERCADO_PAGO_ENCRYPTION_KEY,
    redirectUri: new URL('/mercado-pago/callback', env.FRONTEND_URL).toString(),
  };
});
