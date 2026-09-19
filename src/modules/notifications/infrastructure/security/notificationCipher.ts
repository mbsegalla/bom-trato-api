import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { notificationConfig } from '../../../../config/notification.config.js';
import type { NotificationMessage } from '../../application/types/notification.types.js';

@Injectable()
export class NotificationCipher {
  private readonly key: Buffer;

  constructor(
    @Inject(notificationConfig.KEY)
    config: ConfigType<typeof notificationConfig>,
  ) {
    this.key = Buffer.from(config.encryptionKey, 'hex');
  }

  encrypt(id: string, message: NotificationMessage): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    cipher.setAAD(Buffer.from(id));

    const encrypted = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);

    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(id: string, payload: string): NotificationMessage {
    const parts = payload.split('.');

    if (parts.length !== 3) {
      throw new Error('INVALID_NOTIFICATION_PAYLOAD');
    }

    const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64url'));

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);

    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(tag);

    const value: unknown = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));

    if (
      typeof value !== 'object' ||
      value === null ||
      !('from' in value) ||
      typeof value.from !== 'string' ||
      !('to' in value) ||
      typeof value.to !== 'string' ||
      !('subject' in value) ||
      typeof value.subject !== 'string' ||
      !('html' in value) ||
      typeof value.html !== 'string' ||
      !('text' in value) ||
      typeof value.text !== 'string'
    ) {
      throw new Error('INVALID_NOTIFICATION_PAYLOAD');
    }

    return {
      from: value.from,
      to: value.to,
      subject: value.subject,
      html: value.html,
      text: value.text,
    };
  }
}
