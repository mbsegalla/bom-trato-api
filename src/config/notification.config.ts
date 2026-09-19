import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const notificationConfig = registerAs('notification', () => {
  const env = validateEnvironment(process.env);

  return {
    apiKey: env.RESEND_API_KEY,
    encryptionKey: env.NOTIFICATION_ENCRYPTION_KEY,
    workerEnabled: env.NOTIFICATION_WORKER_ENABLED,
    from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM_EMAIL}>`,
  };
});
