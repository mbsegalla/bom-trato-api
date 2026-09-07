import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const databaseConfig = registerAs('database', () => {
  const env = validateEnvironment(process.env);

  return {
    url: env.DATABASE_URL,
  };
});
