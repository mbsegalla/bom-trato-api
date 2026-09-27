import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const storageConfig = registerAs('storage', () => {
  const env = validateEnvironment(process.env);

  return {
    endpoint: env.STORAGE_S3_ENDPOINT,
    region: env.STORAGE_S3_REGION,
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
    bucket: env.STORAGE_BUCKET,
    publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL.replace(/\/+$/, ''),
  };
});
