import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const notificationConfig = registerAs('notification', () => {
  const env = validateEnvironment(process.env);

  return {
    apiKey: env.RESEND_API_KEY,
    encryptionKey: env.NOTIFICATION_ENCRYPTION_KEY,
    workerEnabled: env.NOTIFICATION_WORKER_ENABLED,
    from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM_EMAIL}>`,
    templates: {
      VERIFY_EMAIL: 'verify-email-v1',
      RESET_PASSWORD: 'reset-password-v1',
      PASSWORD_CHANGED: 'password-changed-v1',
      ORGANIZATION_INVITATION: 'organization-invitation-v1',
      PAYMENT_FAILED: 'payment-failed-v1',
      PAYMENT_ACTION_REQUIRED: 'payment-action-required-v1',
      SUBSCRIPTION_CANCELED: 'subscription-canceled-v1',
      SUBSCRIPTION_ACTIVATED: 'subscription-activated-v1',
      PAYMENT_CONFIRMED: 'payment-confirmed-v1',
      PLAN_CHANGE_CONFIRMED: 'plan-change-confirmed-v1',
    },
  };
});
