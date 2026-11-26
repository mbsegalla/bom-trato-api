import type { ConfigType } from '@nestjs/config';

import type { mercadoPagoConfig } from '../../../../../config/mercadoPago.config.js';
import { ReceivingSettingsError } from '../../../domain/errors/receivingSettings.error.js';
import { MercadoPagoCredentialCipher } from '../../security/mercadoPagoCredentialCipher.js';

import { MercadoPagoClient } from './mercadoPagoClient.js';

type PilotFields = 'livePixEnabled' | 'livePilotOrganizationId' | 'livePilotAccountId' | 'livePilotMaxAmountInCents';
type RuntimeConfig = Omit<ConfigType<typeof mercadoPagoConfig>, PilotFields> &
  Partial<Pick<ConfigType<typeof mercadoPagoConfig>, PilotFields>>;

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
    const max = this.config.livePilotMaxAmountInCents;
    return this.config.livePixEnabled === true && this.liveMode && this.client !== null &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(this.config.livePilotOrganizationId ?? '') &&
      /^[1-9]\d{0,29}$/.test(this.config.livePilotAccountId ?? '') &&
      max !== undefined && Number.isSafeInteger(max) && max >= 1 && max <= 10_000;
  }

  livePixAllowed(organizationId: string, accountId?: string, amountInCents?: number): boolean {
    return this.livePixAvailable && organizationId === this.config.livePilotOrganizationId &&
      (accountId === undefined || accountId === this.config.livePilotAccountId) &&
      (amountInCents === undefined || (
        Number.isSafeInteger(amountInCents) && amountInCents > 0 &&
        amountInCents <= (this.config.livePilotMaxAmountInCents ?? 0)
      ));
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
