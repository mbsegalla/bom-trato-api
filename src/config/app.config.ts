import { registerAs } from '@nestjs/config';

import { NodeEnvironment } from './types/env.types.js';
import { validateEnvironment } from './validation/env.validation.js';

export const appConfig = registerAs('app', () => {
  const env = validateEnvironment(process.env);

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    frontendUrl: env.FRONTEND_URL,
    swaggerEnabled: env.NODE_ENV !== NodeEnvironment.PRODUCTION,
  };
});
