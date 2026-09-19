import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { notificationConfig } from '../../../../config/notification.config.js';
import type { NotificationMessage } from '../../application/types/notification.types.js';

export class NotificationDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds = 0,
  ) {
    super(code);
  }
}

@Injectable()
export class ResendEmailGateway {
  constructor(
    @Inject(notificationConfig.KEY)
    private readonly config: ConfigType<typeof notificationConfig>,
  ) {}

  async send(id: string, message: NotificationMessage): Promise<string> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `notification/${id}`,
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const header = response.headers.get('retry-after');

      const seconds =
        header === null
          ? 0
          : /^\d+$/.test(header)
            ? Number(header)
            : Math.ceil((Date.parse(header) - Date.now()) / 1000);

      await response.body?.cancel();

      throw new NotificationDeliveryError(
        `RESEND_HTTP_${response.status}`,
        response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
        Number.isFinite(seconds) ? Math.max(0, seconds) : 0,
      );
    }

    const result: unknown = await response.json();

    if (typeof result !== 'object' || result === null || !('id' in result) || typeof result.id !== 'string') {
      throw new NotificationDeliveryError('RESEND_INVALID_RESPONSE', true);
    }

    return result.id;
  }
}
