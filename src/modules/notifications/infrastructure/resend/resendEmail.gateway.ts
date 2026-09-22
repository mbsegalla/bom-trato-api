import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { CreateEmailRequestOptions } from 'resend';
import { Resend } from 'resend';

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
  private readonly client: Resend;

  constructor(
    @Inject(notificationConfig.KEY)
    config: ConfigType<typeof notificationConfig>,
  ) {
    this.client = new Resend(config.apiKey);
  }

  async send(id: string, message: NotificationMessage): Promise<string> {
    const options: CreateEmailRequestOptions & { signal: AbortSignal } = {
      idempotencyKey: `notification/${id}`,
      signal: AbortSignal.timeout(10_000),
    };

    try {
      const { data, error, headers } = await this.client.emails.send(message, options);

      if (error !== null) {
        const status = error.statusCode;

        const validStatus = typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599;

        // Reusing a key with a different payload must not be retried.
        if (error.name === 'invalid_idempotent_request') {
          throw new NotificationDeliveryError('RESEND_IDEMPOTENCY_CONFLICT', false);
        }

        throw new NotificationDeliveryError(
          validStatus ? `RESEND_HTTP_${status}` : 'RESEND_UNAVAILABLE',
          !validStatus || status === 408 || status === 409 || status === 429 || status >= 500,
          this.retryAfter(headers?.['retry-after']),
        );
      }

      if (typeof data?.id !== 'string' || data.id.length === 0) {
        throw new NotificationDeliveryError('RESEND_INVALID_RESPONSE', true);
      }

      return data.id;
    } catch (error: unknown) {
      if (error instanceof NotificationDeliveryError) {
        throw error;
      }

      // Never propagate provider messages, request bodies or credentials.
      throw new NotificationDeliveryError('RESEND_UNAVAILABLE', true);
    }
  }

  private retryAfter(header: string | undefined): number {
    if (header === undefined) {
      return 0;
    }

    const seconds = /^\d+$/.test(header) ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000);

    return Number.isFinite(seconds) ? Math.min(86_400, Math.max(0, seconds)) : 0;
  }
}
