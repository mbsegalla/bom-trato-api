import type { ConfigType } from '@nestjs/config';

import type { mercadoPagoConfig } from '../../../../../config/mercadoPago.config.js';
import { ReceivingSettingsError } from '../../../domain/errors/receivingSettings.error.js';
import { MercadoPagoCredentialCipher } from '../../security/mercadoPagoCredentialCipher.js';

import { MercadoPagoClient } from './mercadoPagoClient.js';

type RuntimeConfig = Omit<ConfigType<typeof mercadoPagoConfig>, 'livePixEnabled'> & { livePixEnabled?: boolean };

export class MercadoPagoConnectionRuntime {
  readonly cipher: MercadoPagoCredentialCipher;
  readonly client: MercadoPagoClient | null;

  constructor(private readonly config: RuntimeConfig) {
    this.cipher = new MercadoPagoCredentialCipher(config.encryptionKey);
    this.client =
      config.enabled && config.clientId && config.clientSecret && config.encryptionKey
        ? new MercadoPagoClient({
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            redirectUri: config.redirectUri,
            liveMode: config.liveMode,
          })
        : null;
  }

  get liveMode(): boolean {
    return this.config.liveMode;
  }

  get sandboxPixAvailable(): boolean {
    return this.config.sandboxPixEnabled && !this.liveMode && this.client !== null;
  }

  get livePixAvailable(): boolean {
    return this.config.livePixEnabled === true && this.liveMode && this.client !== null;
  }

  get clientId(): string | undefined {
    return this.config.clientId;
  }

  requireEnabled(): { client: MercadoPagoClient; clientId: string } {
    if (this.client === null || !this.clientId) {
      throw new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE');
    }

    return { client: this.client, clientId: this.clientId };
  }
}
