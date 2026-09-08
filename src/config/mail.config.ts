import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const mailConfig = registerAs('mail', () => {
  const env = validateEnvironment(process.env);

  return {
    from: {
      name: env.MAIL_FROM_NAME,
      email: env.MAIL_FROM_EMAIL,
    },
    smtp: {
      host: env.MAIL_SMTP_HOST,
      port: env.MAIL_SMTP_PORT,
      secure: env.MAIL_SMTP_SECURE,
      user: env.MAIL_SMTP_USER,
      password: env.MAIL_SMTP_PASSWORD,
    },
  };
});

export type MailConfiguration = ReturnType<typeof mailConfig>;
