import { registerAs } from '@nestjs/config';

import { NodeEnvironment } from './types/env.types.js';
import { validateEnvironment } from './validation/env.validation.js';

export const appConfig = registerAs('app', () => {
  const env = validateEnvironment(process.env);

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    trustProxy: env.TRUST_PROXY.split(',')
      .map((address) => address.trim())
      .filter(Boolean),
    frontendUrl: new URL(env.FRONTEND_URL).origin,
    workOrderRecurrenceWorkerEnabled: env.WORK_ORDER_RECURRENCE_WORKER_ENABLED,
    workOrderRecurrenceReminderWorkerEnabled: env.WORK_ORDER_RECURRENCE_REMINDER_WORKER_ENABLED,
    isProduction: env.NODE_ENV === NodeEnvironment.PRODUCTION,
    swaggerEnabled: env.NODE_ENV !== NodeEnvironment.PRODUCTION,
  };
});
