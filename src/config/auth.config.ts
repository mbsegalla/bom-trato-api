import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const authConfig = registerAs('auth', () => {
  const env = validateEnvironment(process.env);

  return {
    jwtSecret: env.AUTH_JWT_SECRET,
    csrfSecret: env.AUTH_CSRF_SECRET,
    issuer: env.AUTH_JWT_ISSUER,
    audience: env.AUTH_JWT_AUDIENCE,
    accessTtlSeconds: env.AUTH_ACCESS_TTL_SECONDS,
    idleTtlSeconds: env.AUTH_IDLE_TTL_SECONDS,
    absoluteTtlSeconds: env.AUTH_ABSOLUTE_TTL_SECONDS,
    verificationTtlSeconds: 86400,
    resetTtlSeconds: 1800,
  };
});
