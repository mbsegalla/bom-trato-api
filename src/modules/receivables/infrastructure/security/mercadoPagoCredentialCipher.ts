import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';

export class MercadoPagoCredentialCipher {
  private readonly key: Buffer | null;

  constructor(key: string | undefined) {
    if (key !== undefined && !/^[a-fA-F0-9]{64}$/.test(key)) {
      throw new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE');
    }

    this.key = key === undefined ? null : Buffer.from(key, 'hex');
  }

  seal(context: readonly string[], value: string): string {
    if (this.key === null) {
      throw new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(this.aad(context));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  }

  open(context: readonly string[], payload: string): string {
    if (this.key === null) {
      throw new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE');
    }

    try {
      const parts = payload.split('.');

      if (parts.length !== 4 || parts[0] !== 'v1') {
        throw new Error('Invalid credential');
      }

      const iv = Buffer.from(parts[1], 'base64url');
      const tag = Buffer.from(parts[2], 'base64url');
      const encrypted = Buffer.from(parts[3], 'base64url');

      if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) {
        throw new Error('Invalid credential');
      }

      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(this.aad(context));
      decipher.setAuthTag(tag);

      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      throw new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE');
    }
  }

  private aad(context: readonly string[]): Buffer {
    return Buffer.from(JSON.stringify(['mercado-pago', 'v1', ...context]));
  }
}
