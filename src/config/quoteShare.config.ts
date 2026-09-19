import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const quoteShareConfig = registerAs('quoteShare', () => {
  const env = validateEnvironment(process.env);

  return {
    rateLimitSecret: env.QUOTE_SHARE_RATE_LIMIT_SECRET,
    cleanupWorkerEnabled: env.QUOTE_SHARE_CLEANUP_WORKER_ENABLED,
  };
});
