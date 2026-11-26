import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { PixKeyType } from '../../domain/types/receivingSettings.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';

export class ReceivingSettingsCipher {
  private readonly key: Buffer | null;

  constructor(encryptionKey: string | undefined) {
    if (encryptionKey !== undefined && !/^[a-fA-F0-9]{64}$/.test(encryptionKey)) {
      throw new ReceivingSettingsError('RECEIVING_SETTINGS_UNAVAILABLE');
    }

    this.key = encryptionKey === undefined ? null : Buffer.from(encryptionKey, 'hex');
  }

  get available(): boolean {
    return this.key !== null;
  }

  encrypt(organizationId: string, type: PixKeyType, value: string): string {
    if (this.key === null) {
      throw new ReceivingSettingsError('RECEIVING_SETTINGS_UNAVAILABLE');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    cipher.setAAD(Buffer.from(`receiving-settings:v1:${organizationId}:${type}`));

    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(organizationId: string, type: PixKeyType, payload: string): string {
    if (this.key === null) {
      throw new ReceivingSettingsError('RECEIVING_SETTINGS_UNAVAILABLE');
    }

    try {
      const parts = payload.split('.');

      if (parts.length !== 4 || parts[0] !== 'v1') {
        throw new Error('Invalid payload');
      }

      const iv = Buffer.from(parts[1], 'base64url');
      const tag = Buffer.from(parts[2], 'base64url');
      const encrypted = Buffer.from(parts[3], 'base64url');

      if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) {
        throw new Error('Invalid payload');
      }

      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(Buffer.from(`receiving-settings:v1:${organizationId}:${type}`));
      decipher.setAuthTag(tag);

      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      throw new ReceivingSettingsError('RECEIVING_SETTINGS_UNAVAILABLE');
    }
  }
}
