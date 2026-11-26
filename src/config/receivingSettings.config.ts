import { registerAs } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';

export const receivingSettingsConfig = registerAs('receivingSettings', () => {
  const env = validateEnvironment(process.env);

  return {
    encryptionKey: env.RECEIVING_SETTINGS_ENCRYPTION_KEY,
  };
});
