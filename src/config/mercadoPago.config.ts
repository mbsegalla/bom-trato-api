import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const mercadoPagoConfig = registerAs('mercadoPago', () => {
  const env = validateEnvironment(process.env);

  return {
    enabled: env.MERCADO_PAGO_ENABLED,
    liveMode: env.MERCADO_PAGO_LIVE_MODE,
    sandboxPixEnabled: env.MERCADO_PAGO_SANDBOX_PIX_ENABLED,
    livePixEnabled: env.MERCADO_PAGO_LIVE_PIX_ENABLED === true && env.MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED === true,
    livePilotOrganizationId: env.MERCADO_PAGO_LIVE_PILOT_ORGANIZATION_ID,
    livePilotAccountId: env.MERCADO_PAGO_LIVE_PILOT_ACCOUNT_ID,
    livePilotMaxAmountInCents: env.MERCADO_PAGO_LIVE_PILOT_MAX_AMOUNT_IN_CENTS,
    clientId: env.MERCADO_PAGO_CLIENT_ID,
    clientSecret: env.MERCADO_PAGO_CLIENT_SECRET,
    encryptionKey: env.MERCADO_PAGO_ENCRYPTION_KEY,
    redirectUri: new URL('/mercado-pago/callback', env.FRONTEND_URL).toString(),
  };
});
